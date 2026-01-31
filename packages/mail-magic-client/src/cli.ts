#!/usr/bin/env node

import fs from 'fs';
import readline from 'readline';

import { Command } from 'commander';

import { loadCliEnv, resolveToken } from './cli-env';
import { pushTemplate, pushTemplateDir } from './cli-helpers';
import TemplateClient from './mail-magic-client';
import { do_the_template_thing } from './preprocess';

const program = new Command();
const envDefaults = loadCliEnv();
const defaultToken = resolveToken(envDefaults);

const apiDefault = envDefaults.api || 'http://localhost:3000';

program.option('-a, --api <api>', 'Base API endpoint', apiDefault);
if (defaultToken) {
	program.option('-t, --token <token>', 'Authentication token in the format "username:token"', defaultToken);
} else {
	program.option('-t, --token <token>', 'Authentication token in the format "username:token"');
}
program
	.option('-f, --file <file>', 'Path to the file containing the template data (Nunjucks with MJML)')
	.option('-s, --sender <sender>', 'Sender email address')
	.option('-r, --rcpt <rcpt>', 'Recipient email addresses (comma-separated)')
	.option('-n, --name <name>', 'Template name')
	.option('-b, --subject <subject>', 'Email subject')
	.option('-l, --locale <locale>', 'Locale')
	.option('-d, --domain <domain>', 'Domain', envDefaults.domain)
	.option('-p, --part <true|false>', 'Part')
	.option('-v, --vars <vars>', 'Template parameters (JSON string)');

const readStdin = async (): Promise<string> => {
	if (process.stdin.isTTY) {
		return '';
	}
	return new Promise((resolve, reject) => {
		const rl = readline.createInterface({
			input: process.stdin,
			output: process.stdout,
			terminal: false
		});
		let data = '';
		rl.on('line', (line) => {
			data += line + '\n';
		});
		rl.on('close', () => {
			resolve(data.trim());
		});
		rl.on('error', (err) => {
			reject(err);
		});
	});
};

const getTemplateData = async (): Promise<string> => {
	if (program.opts().file) {
		const filePath = program.opts().file;
		if (!fs.existsSync(filePath)) {
			throw new Error(`File not found: ${filePath}`);
		}
		return fs.readFileSync(filePath, 'utf-8');
	} else {
		return await readStdin();
	}
};

program
	.command('template')
	.description('Store a template on the server')
	.action(async () => {
		const client = new TemplateClient(program.opts().api, program.opts().token);
		try {
			const template = await getTemplateData();
			const templateData = {
				template,
				sender: program.opts().sender,
				name: program.opts().name,
				subject: program.opts().subject,
				locale: program.opts().locale,
				domain: program.opts().domain,
				part: !!program.opts().part
			};
			const result = await client.storeTemplate(templateData);
			console.log('Template updated');
		} catch (error) {
			if (error instanceof Error) {
				console.error('Error:', error.message);
			} else {
				console.error('An unknown error occurred.');
			}
			process.exit(1);
		}
	});

program
	.command('send')
	.description('Send a template to recipients')
	.action(async () => {
		const client = new TemplateClient(program.opts().api, program.opts().token);
		try {
			const template = await getTemplateData();
			const vars: any = program.opts().vars ? JSON.parse(program.opts().vars) : '{}';
			const templateData = {
				name: program.opts().name,
				rcpt: program.opts().rcpt,
				domain: program.opts().domain,
				locale: program.opts().locale,
				vars
			};
			const result = await client.sendTemplate(templateData);
			console.log('Template sent');
		} catch (error) {
			if (error instanceof Error) {
				console.error('Error:', error.message);
			} else {
				console.error('An unknown error occurred.');
			}
			process.exit(1);
		}
	});

program
	.command('version')
	.description('Show current client version')
	.action(async (cmdOptions) => {
		console.log('1.0.19');
	});

program
	.command('compile')
	.description('Compile templates by resolving inheritance and processing with FFE')
	.option('-i, --input <input>', 'Input directory', './templates')
	.option('-o, --output <output>', 'Output directory', './templates-dist')
	.option('-c, --css <css>', 'Path to Foundation for Emails CSS', './templates/foundation-emails.css')
	.option('-t, --template <template>', 'Process a specific template only')
	.action(async (cmdOptions) => {
		try {
			await do_the_template_thing({
				src_dir: cmdOptions.input,
				dist_dir: cmdOptions.output,
				css_path: cmdOptions.css,
				tplname: cmdOptions.template // Pass undefined if not specified
			});
		} catch (error) {
			if (error instanceof Error) {
				console.error('Error:', error.message);
			} else {
				console.error('An unknown error occurred.');
			}
			process.exit(1);
		}
	});

program
	.command('push')
	.description('Compile a template with partials and store it on the server')
	.option('-i, --input <input>', 'Input directory', './templates')
	.option('-c, --css <css>', 'Path to Foundation for Emails CSS', './templates/foundation-emails.css')
	.option('-t, --template <template>', 'Template path relative to input (without .njk)')
	.option('-n, --name <name>', 'Template name (defaults to template basename)')
	.option('-s, --sender <sender>', 'Sender email address')
	.option('-b, --subject <subject>', 'Email subject')
	.option('-l, --locale <locale>', 'Locale')
	.option('-d, --domain <domain>', 'Domain')
	.option('--dry-run', 'Show what would be uploaded without sending anything')
	.action(async (cmdOptions) => {
		try {
			const summary = await pushTemplate({
				api: program.opts().api,
				token: program.opts().token,
				domain: cmdOptions.domain,
				template: cmdOptions.template,
				name: cmdOptions.name,
				locale: cmdOptions.locale,
				sender: cmdOptions.sender,
				subject: cmdOptions.subject,
				input: cmdOptions.input,
				css: cmdOptions.css,
				dryRun: !!cmdOptions.dryRun
			});
			if (cmdOptions.dryRun) {
				console.log(`Dry run - template: ${summary.domain} ${summary.locale || ''} ${summary.name}`);
				console.log(`Source: ${summary.filePath}`);
			} else {
				console.log('Template compiled and uploaded');
			}
		} catch (error) {
			if (error instanceof Error) {
				console.error('Error:', error.message);
			} else {
				console.error('An unknown error occurred.');
			}
			process.exit(1);
		}
	});

program
	.command('push-dir')
	.description('Upload templates and assets from a config-style directory')
	.option('-i, --input <input>', 'Config directory (contains init-data.json)', './data')
	.option('-c, --css <css>', 'Path to Foundation for Emails CSS (optional)')
	.option('--dry-run', 'Show what would be uploaded without sending anything')
	.option('--skip-assets', 'Skip asset uploads')
	.option('--skip-tx', 'Skip transactional templates')
	.option('--skip-forms', 'Skip form templates')
	.option('-d, --domain <domain>', 'Domain to upload (overrides global)')
	.action(async (cmdOptions) => {
		try {
			const summary = await pushTemplateDir({
				api: program.opts().api,
				token: program.opts().token,
				input: cmdOptions.input,
				domain: cmdOptions.domain || program.opts().domain,
				css: cmdOptions.css,
				includeAssets: !cmdOptions.skipAssets,
				includeTx: !cmdOptions.skipTx,
				includeForms: !cmdOptions.skipForms,
				dryRun: !!cmdOptions.dryRun
			});
			if (cmdOptions.dryRun) {
				console.log('Dry run - planned uploads:');
				for (const action of summary.actions) {
					if (action.kind === 'tx-template') {
						console.log(`tx-template: ${action.domain} ${action.locale || ''} ${action.template}`);
					} else if (action.kind === 'form-template') {
						console.log(`form-template: ${action.domain} ${action.locale || ''} ${action.template}`);
					} else if (action.kind === 'domain-assets') {
						const files = action.files?.join(', ') || '';
						console.log(`domain-assets: ${action.domain} ${action.path || '.'} ${files}`);
					} else if (action.kind === 'template-assets') {
						const files = action.files?.join(', ') || '';
						console.log(
							`template-assets: ${action.domain} ${action.locale || ''} ${action.template} ${action.path || '.'} ${files}`
						);
					}
				}
				console.log(
					`Summary: ${summary.templates} tx template(s), ${summary.forms} form template(s), ${summary.assetBatches} asset batch(es)`
				);
			} else {
				console.log('Templates and assets uploaded');
			}
		} catch (error) {
			if (error instanceof Error) {
				console.error('Error:', error.message);
			} else {
				console.error('An unknown error occurred.');
			}
			process.exit(1);
		}
	});

program
	.command('assets')
	.description('Upload asset files to the server')
	.option('-f, --file <file...>', 'Asset file path(s)')
	.option('--template-type <type>', 'Template type (tx or form)')
	.option('--template <template>', 'Template name/idname')
	.option('--path <path>', 'Destination subdirectory under assets or template')
	.option('-l, --locale <locale>', 'Locale')
	.option('--dry-run', 'Show what would be uploaded without sending anything')
	.action(async (cmdOptions) => {
		const client = new TemplateClient(program.opts().api, program.opts().token);
		try {
			const files = cmdOptions.file as string[] | undefined;
			if (!files || files.length === 0) {
				throw new Error('At least one --file is required');
			}
			if (cmdOptions.dryRun) {
				for (const file of files) {
					if (!fs.existsSync(file)) {
						throw new Error(`File not found: ${file}`);
					}
				}
				console.log('Dry run - assets:');
				console.log(
					`domain=${program.opts().domain} templateType=${cmdOptions.templateType || ''} template=${cmdOptions.template || ''} locale=${cmdOptions.locale || ''} path=${cmdOptions.path || ''}`
				);
				console.log(`files=${files.join(', ')}`);
				return;
			}

			await client.uploadAssets({
				domain: program.opts().domain,
				files,
				templateType: cmdOptions.templateType,
				template: cmdOptions.template,
				locale: cmdOptions.locale,
				path: cmdOptions.path
			});
			console.log('Assets uploaded');
		} catch (error) {
			if (error instanceof Error) {
				console.error('Error:', error.message);
			} else {
				console.error('An unknown error occurred.');
			}
			process.exit(1);
		}
	});

program.parse(process.argv);
