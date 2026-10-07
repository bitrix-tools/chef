import { Environment } from '../../../environment/environment';
import { OxlintLspProxy } from '../../../modules/engines/lint/oxlint/lsp-proxy';

/**
 * Serves LSP on stdin/stdout until the editor closes the connection.
 */
export async function runLanguageServer(): Promise<void>
{
	const rootPath = Environment.getRoot() ?? process.cwd();
	await new OxlintLspProxy(rootPath).start();
}
