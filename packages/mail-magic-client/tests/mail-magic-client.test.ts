import fs from 'fs';
import os from 'os';
import path from 'path';

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import TemplateClient from '../src/mail-magic-client';

describe('TemplateClient', () => {
	let fetchSpy: ReturnType<typeof vi.fn>;

	beforeEach(() => {
		fetchSpy = vi.fn(async (url: string, options?: RequestInit) => {
			return new Response(JSON.stringify({ ok: true, url, options }), {
				status: 200,
				headers: { 'Content-Type': 'application/json' }
			});
		});
		vi.stubGlobal('fetch', fetchSpy);
	});

	afterEach(() => {
		vi.unstubAllGlobals();
	});

	it('posts transactional templates to the API', async () => {
		const client = new TemplateClient('http://localhost:4000', 'test-token');
		await client.storeTemplate({
			template: '<p>Hello {{ name }}</p>',
			name: 'welcome',
			domain: 'example.test',
			sender: 'Test Sender <sender@example.test>'
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:4000/api/v1/tx/template');
		const headers = options.headers as Record<string, string>;
		expect(headers.Authorization).toBe('Bearer apikey-test-token');
		const body = JSON.parse(String(options.body));
		expect(body.name).toBe('welcome');
		expect(body.domain).toBe('example.test');
	});

	it('storeTemplate delegates to storeTxTemplate alias', async () => {
		const client = new TemplateClient('http://localhost:4000', 'test-token');
		const spy = vi.spyOn(client, 'storeTxTemplate').mockResolvedValue({ Status: 'OK' });
		const payload = {
			template: '<p>Hello {{ name }}</p>',
			name: 'welcome',
			domain: 'example.test',
			sender: 'Test Sender <sender@example.test>'
		};

		await client.storeTemplate(payload);

		expect(spy).toHaveBeenCalledTimes(1);
		expect(spy).toHaveBeenCalledWith(payload);
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('validates templates without requiring a cwd templates loader', async () => {
		const client = new TemplateClient('http://localhost:4000', 'test-token');
		await client.storeTemplate({
			template: '{% include "partials/header.njk" %}<p>Hello</p>',
			name: 'include-template',
			domain: 'example.test',
			sender: 'Test Sender <sender@example.test>'
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:4000/api/v1/tx/template');
	});

	it('rejects invalid templates before sending', async () => {
		const client = new TemplateClient('http://localhost:4000', 'test-token');
		await expect(
			client.storeTemplate({
				template: '{% if %}',
				name: 'bad-template',
				domain: 'example.test'
			})
		).rejects.toThrow('Template validation failed');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('rejects invalid sender formats', async () => {
		const client = new TemplateClient('http://localhost:4000', 'test-token');
		await expect(
			client.storeTemplate({
				template: '<p>Hi</p>',
				name: 'welcome',
				domain: 'example.test',
				sender: 'sender@example.test'
			})
		).rejects.toThrow('Invalid sender format');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('omits request bodies for GET requests', async () => {
		const client = new TemplateClient('http://localhost:4000', 'test-token');
		await client.get('/api/v1/ping');

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:4000/api/v1/ping');
		expect(options.method).toBe('GET');
		expect(options.body).toBeUndefined();
		const headers = options.headers as Record<string, string>;
		expect(headers.Authorization).toBe('Bearer apikey-test-token');
		expect(headers['Content-Type']).toBeUndefined();
		expect(headers.Accept).toBe('application/json');
	});

	it('sends transactional templates with valid recipients', async () => {
		const client = new TemplateClient('http://localhost:4000', 'test-token');
		await client.sendTemplate({
			name: 'welcome',
			domain: 'example.test',
			rcpt: 'valid@example.test',
			vars: { name: 'Sam' }
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:4000/api/v1/tx/message');
		const body = JSON.parse(String(options.body));
		expect(body.rcpt).toBe('valid@example.test');
	});

	it('rejects invalid recipient addresses', async () => {
		const client = new TemplateClient('http://localhost:4000', 'test-token');
		await expect(
			client.sendTemplate({
				name: 'welcome',
				domain: 'example.test',
				rcpt: 'nope'
			})
		).rejects.toThrow('Invalid email address');
		expect(fetchSpy).not.toHaveBeenCalled();
	});

	it('stores form templates via the API', async () => {
		const client = new TemplateClient('http://localhost:4000', 'test-token');
		await client.storeFormTemplate({
			domain: 'example.test',
			idname: 'contact',
			template: '<p>Hello {{ _fields_.name }}</p>',
			sender: 'Forms <forms@example.test>',
			recipient: 'owner@example.test',
			subject: 'Contact'
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:4000/api/v1/form/template');
		const body = JSON.parse(String(options.body));
		expect(body.idname).toBe('contact');
		expect(body.domain).toBe('example.test');
	});

	it('stores form recipients via the API', async () => {
		const client = new TemplateClient('http://localhost:4000', 'test-token');
		await client.storeFormRecipient({
			domain: 'example.test',
			idname: 'support',
			email: 'Support <support@example.test>',
			name: 'Support Team',
			formid: 'contact',
			locale: 'en'
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:4000/api/v1/form/recipient');
		const body = JSON.parse(String(options.body));
		expect(body.idname).toBe('support');
		expect(body.domain).toBe('example.test');
	});

	it('sends form messages as JSON when no attachments are provided', async () => {
		const client = new TemplateClient('http://localhost:4000', 'test-token');
		await client.sendFormMessage({
			_mm_form_key: 'form-key-123',
			fields: { name: 'Sam', email: 'sam@example.test' }
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:4000/api/v1/form/message');
		const body = JSON.parse(String(options.body));
		expect(body._mm_form_key).toBe('form-key-123');
		expect(body.name).toBe('Sam');
	});

	it('sends transactional messages with attachments using form data', async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-magic-client-'));
		const attachmentPath = path.join(tempDir, 'sample.txt');
		fs.writeFileSync(attachmentPath, 'sample');

		const client = new TemplateClient('http://localhost:4000', 'test-token');
		await client.sendTxMessage({
			name: 'welcome',
			domain: 'example.test',
			rcpt: 'valid@example.test',
			attachments: [{ path: attachmentPath }]
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(options.body).toBeInstanceOf(FormData);
		const formData = options.body as FormData;
		expect(formData.get('attachment')).toBeTruthy();
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('sends form messages with attachments using form data', async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-magic-client-'));
		const attachmentPath = path.join(tempDir, 'sample.txt');
		fs.writeFileSync(attachmentPath, 'sample');

		const client = new TemplateClient('http://localhost:4000', 'test-token');
		await client.sendFormMessage({
			_mm_form_key: 'form-key-123',
			fields: { name: 'Sam' },
			attachments: [{ path: attachmentPath }]
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(options.body).toBeInstanceOf(FormData);
		const formData = options.body as FormData;
		expect(formData.get('_mm_file1')).toBeTruthy();
		expect(formData.get('_mm_form_key')).toBe('form-key-123');
		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('uploads assets using form data', async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-magic-client-'));
		const assetPath = path.join(tempDir, 'asset.txt');
		fs.writeFileSync(assetPath, 'asset');

		const client = new TemplateClient('http://localhost:4000', 'test-token');
		await client.uploadAssets({
			domain: 'example.test',
			files: [assetPath],
			templateType: 'tx',
			template: 'welcome',
			locale: 'en',
			path: 'images'
		});

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:4000/api/v1/assets');
		expect(options.body).toBeInstanceOf(FormData);
		const formData = options.body as FormData;
		expect(formData.get('domain')).toBe('example.test');
		expect(formData.get('templateType')).toBe('tx');
		expect(formData.get('template')).toBe('welcome');
		expect(formData.get('locale')).toBe('en');
		expect(formData.get('path')).toBe('images');
		expect(formData.get('asset')).toBeTruthy();

		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('rejects headers when attachments are provided', async () => {
		const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mail-magic-client-'));
		const attachmentPath = path.join(tempDir, 'sample.txt');
		fs.writeFileSync(attachmentPath, 'sample');

		const client = new TemplateClient('http://localhost:4000', 'test-token');
		await expect(
			client.sendTxMessage({
				name: 'welcome',
				domain: 'example.test',
				rcpt: 'valid@example.test',
				headers: { 'X-Test': '1' },
				attachments: [{ path: attachmentPath }]
			})
		).rejects.toThrow('Headers are not supported');

		fs.rmSync(tempDir, { recursive: true, force: true });
	});

	it('fetches the swagger spec from the mail-magic endpoint', async () => {
		const client = new TemplateClient('http://localhost:4000', 'test-token');
		await client.getSwaggerSpec();

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:4000/api/swagger');
		expect(options.method).toBe('GET');
	});

	it('fetches public assets through the direct asset route', async () => {
		fetchSpy = vi.fn(async () => {
			return new Response('asset-bytes', { status: 200 });
		});
		vi.stubGlobal('fetch', fetchSpy);

		const client = new TemplateClient('http://localhost:4000', 'test-token');
		const bytes = await client.fetchPublicAsset('example.test', 'images/logo file.png');

		expect(bytes.byteLength).toBeGreaterThan(0);
		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url, options] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:4000/asset/example.test/images/logo%20file.png');
		expect(options.method).toBe('GET');
	});

	it('fetches public assets through the api-base compatibility route', async () => {
		fetchSpy = vi.fn(async () => {
			return new Response('asset-bytes', { status: 200 });
		});
		vi.stubGlobal('fetch', fetchSpy);

		const client = new TemplateClient('http://localhost:4000', 'test-token');
		await client.fetchPublicAsset('example.test', 'images/logo.png', true);

		expect(fetchSpy).toHaveBeenCalledTimes(1);
		const [url] = fetchSpy.mock.calls[0] as [string, RequestInit];
		expect(url).toBe('http://localhost:4000/api/asset/example.test/images/logo.png');
	});
});
