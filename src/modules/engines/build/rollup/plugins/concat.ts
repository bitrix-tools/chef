import Concat from 'concat-with-sourcemaps';
import path from 'path';
import { readFileSync, existsSync } from 'fs';
import type { OutputBundle, OutputChunk, OutputAsset } from 'rollup';

const separator = '\n\n';
const generateSourceMap = true;

export default function concatPlugin(options: { jsFiles?: Array<string>; cssFiles?: Array<string> } = {}) {
	const {
		jsFiles = [],
		cssFiles = [],
	} = options;

	return {
		name: 'concat',

		generateBundle(outputOptions, bundle: OutputBundle) {
			// Skip if no concat files specified
			if (jsFiles.length === 0 && cssFiles.length === 0)
			{
				return;
			}

			const determineOutputName = (outputOpt, defaultBaseName, extension) => {
				if (outputOpt && typeof outputOpt === 'string') {
					return path.basename(outputOpt, path.extname(outputOpt)) + extension;
				}
				return defaultBaseName;
			};

			const outputJsFileName = determineOutputName(outputOptions.file, 'concatenated.js', '.js');
			const outputJsSourceMapName = determineOutputName(outputOptions.file, 'concatenated.js', '.js.map');
			const outputJsFilePath = outputOptions.file;

			// Get bundle content for the main output file
			const getBundleContent = () => {
				for (const [fileName, fileInfo] of Object.entries(bundle))
				{
					if (fileName.endsWith('.js'))
					{
						let content = '';
						let sourceMapContent = null;

						if (fileInfo.type === 'chunk')
						{
							content = fileInfo.code;
							if (fileInfo.map)
							{
								sourceMapContent = JSON.stringify(fileInfo.map);
							}
						}
						else if (fileInfo.type === 'asset')
						{
							content = fileInfo.source as string;
						}

						content = content
							.replace(/\/\*(\s+)?eslint-disable(\s+)?\*\/\n/g, '')
							.replace(/\/\/# sourceMappingURL=(.*)\.map/g, '');

						return { content, sourceMapContent, fileName };
					}
				}
				return null;
			};

			if (jsFiles.length > 0)
			{
				const concatenator = new Concat(generateSourceMap, outputJsFileName, separator);
				const bundleContent = getBundleContent();

				// Process files in order from concat config
				for (const filePath of jsFiles)
				{
					const fileName = path.basename(filePath);
					const isOutputFile = outputJsFilePath && (
						filePath === outputJsFilePath ||
						path.resolve(filePath) === path.resolve(outputJsFilePath) ||
						fileName === outputJsFileName
					);

					if (isOutputFile && bundleContent)
					{
						// Insert the compiled bundle at this position
						concatenator.add(bundleContent.fileName, bundleContent.content, bundleContent.sourceMapContent);
					}
					else if (existsSync(filePath))
					{
						try
						{
							let fileContent = readFileSync(filePath, 'utf8');
							let sourceMapContent = null;
							const mapPath = `${filePath}.map`;

							try
							{
								const mapRaw = readFileSync(mapPath, 'utf8');
								const mapObj = JSON.parse(mapRaw);
								mapObj.sources = mapObj.sources.map(src => path.resolve(path.dirname(mapPath), src));
								sourceMapContent = JSON.stringify(mapObj);
							}
							catch (e)
							{
								// No source map, that's fine
							}

							fileContent = fileContent
								.replace(/\/\*(\s+)?eslint-disable(\s+)?\*\/\n/g, '')
								.replace(/\/\/# sourceMappingURL=(.*)\.map/g, '');

							concatenator.add(filePath, fileContent, sourceMapContent);
						}
						catch (error)
						{
							this.warn(`Could not read JS file '${filePath}': ${error.message}`);
						}
					}
					else
					{
						this.warn(`JS file not found: '${filePath}'`);
					}
				}

				if (concatenator.content)
				{
					let resultFileContent = concatenator.content
						.toString()
						.replace(/\/\/# sourceMappingURL=(.*)\.map/g, '')
						+ `\n//# sourceMappingURL=${path.basename(outputJsSourceMapName)}`;

					resultFileContent = `/* eslint-disable */\n${resultFileContent}`;

					// Remove old bundle entries and add concatenated result
					for (const fileName of Object.keys(bundle))
					{
						if (fileName.endsWith('.js') || fileName.endsWith('.js.map'))
						{
							delete bundle[fileName];
						}
					}

					bundle[outputJsFileName] = {
						fileName: outputJsFileName,
						type: 'asset',
						source: resultFileContent,
						needsCodeReference: false,
						name: outputJsFileName,
						names: [],
						originalFileName: null,
						originalFileNames: [],
					} as OutputAsset;

					if (concatenator.sourceMap)
					{
						bundle[outputJsSourceMapName] = {
							fileName: outputJsSourceMapName,
							type: 'asset',
							source: concatenator.sourceMap,
							needsCodeReference: false,
							name: outputJsSourceMapName,
							names: [],
							originalFileName: null,
							originalFileNames: [],
						} as OutputAsset;
					}
				}
			}

			if (cssFiles.length > 0)
			{
				const outputCssFileName = determineOutputName(outputOptions.file, 'concatenated.css', '.css');

				// Get CSS bundle content
				const getCssBundleContent = () => {
					for (const [fileName, fileInfo] of Object.entries(bundle))
					{
						if (/\.(css|scss|sass|less)$/i.test(fileName) && fileInfo.type === 'asset')
						{
							return { content: fileInfo.source as string, fileName };
						}
					}
					return null;
				};

				let concatenatedCss = '';
				const cssBundleContent = getCssBundleContent();

				for (const filePath of cssFiles)
				{
					const fileName = path.basename(filePath);
					const isOutputFile = fileName === outputCssFileName ||
						filePath.endsWith(outputCssFileName);

					if (isOutputFile && cssBundleContent)
					{
						concatenatedCss += cssBundleContent.content + '\n';
					}
					else if (existsSync(filePath))
					{
						try
						{
							const fileContent = readFileSync(filePath, 'utf8');
							concatenatedCss += fileContent + '\n';
						}
						catch (error)
						{
							this.warn(`Could not read CSS file '${filePath}': ${error.message}`);
						}
					}
					else
					{
						this.warn(`CSS file not found: '${filePath}'`);
					}
				}

				if (concatenatedCss)
				{
					// Remove old CSS bundle entries
					for (const fileName of Object.keys(bundle))
					{
						if (/\.(css|scss|sass|less)$/i.test(fileName))
						{
							delete bundle[fileName];
						}
					}

					bundle[outputCssFileName] = {
						fileName: outputCssFileName,
						type: 'asset',
						source: concatenatedCss.trimEnd(),
						needsCodeReference: false,
						name: outputCssFileName,
						names: [],
						originalFileName: null,
						originalFileNames: [],
					} as OutputAsset;
				}
			}
		}
	};
}
