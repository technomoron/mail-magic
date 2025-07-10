import { FormAPI } from './api/forms.js';
import { MailerAPI } from './api/mailer.js';
import { mailApiServer } from './server.js';
import { mailStore } from './store/store.js';

(async () => {
	try {
		const store: mailStore = await new mailStore().init();
		const env = store.env;
		const server = new mailApiServer(
			{
				apiHost: env.API_HOST,
				apiPort: env.API_PORT,
				uploadPath: env.UPLOAD_PATH,
				debug: true
			},
			store
		)
			.api(new MailerAPI())
			.api(new FormAPI());

		server.start();
	} catch (err) {
		console.error('Failed to start FormMailer:', err);
		process.exit(1);
	}
})();
