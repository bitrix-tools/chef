import Concat from 'concat-with-sourcemaps';
import path from 'node:path';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import type { OutputBundle, OutputChunk } from 'rolldown';

const separator = '\n\n';
const generateSourceMap = true;

export default function concatPlugin(options: { jsFiles?: Array<string>; cssFiles?: Array<string> } = {}) {
	const {
		jsFiles = [],
		cssFiles = [],
	} = options;

	return {
		name: 'concat',

		writeBundle(outputOptions: any, bundle: OutputBundle) {
			if (jsFiles.length === 0 && cssFiles.length === 0)
			{
				return;
			}

			const outputDir = outputOptions.dir || (outputOptions.file ? path.dirname(outputOptions.file) : process.cwd());

			const determineOutputName = (outputOpt: any, defaultBaseName: string, extension: string) => {
				if (outputOpt && typeof outputOpt === 'string') {
					return path.basename(outputOpt, path.extname(outputOpt)) + extension;
				}
				return defaultBaseName;
			};

			const outputJsFileName = determineOutputName(outputOptions.file, 'concatenated.js', '.js');
			const outputJsSourceMapName = determineOutputName(outputOptions.file, 'concatenated.js', '.js.map');
			const outputJsFilePath = outputOptions.file;

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
								mapObj.sources = mapObj.sources.map((src: string) => path.resolve(path.dirname(mapPath), src));
								sourceMapContent = JSON.stringify(mapObj);
							}
							catch (e)
							{
								// No source map
							}

							fileContent = fileContent
								.replace(/\/\*(\s+)?eslint-disable(\s+)?\*\/\n/g, '')
								.replace(/\/\/# sourceMappingURL=(.*)\.map/g, '');

							concatenator.add(filePath, fileContent, sourceMapContent);
						}
						catch (error: any)
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

					writeFileSync(path.join(outputDir, outputJsFileName), resultFileContent);

					if (concatenator.sourceMap)
					{
						writeFileSync(path.join(outputDir, outputJsSourceMapName), concatenator.sourceMap);
					}
				}
			}

			if (cssFiles.length > 0)
			{
				const outputCssFileName = determineOutputName(outputOptions.file, 'concatenated.css', '.css');

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
						catch (error: any)
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
					writeFileSync(path.join(outputDir, outputCssFileName), concatenatedCss.trimEnd());
				}
			}
		}
	};
}
