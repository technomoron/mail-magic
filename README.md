# @technomoron/mail-magic

Mail Magic is a TypeScript service for managing, templating, and delivering transactional emails. It exposes a small REST API built on `@technomoron/api-server-base`, persists data with Sequelize/SQLite, and renders outbound messages with Nunjucks templates.

## Features

- Upload, store, and send templated email content through a JSON API
- Preprocess template assets with `@technomoron/unyuck` before persisting
- Nodemailer transport configuration driven by environment variables
- SQLite-backed data models for domains, users, forms, and templates
- Type-safe configuration loader powered by `@technomoron/env-loader`

## Getting Started

1. Clone the repository: `git clone git@github.com:technomoron/mail-magic.git`
2. Install dependencies: `npm install`
3. Create your environment file: copy `.env-dist` to `.env` and adjust values
4. Populate the config directory (see `config-example/` for a reference layout)
5. Build the project: `npm run build`
6. Start the API server: `npm run start`

During development you can run `npm run dev` for a watch mode that recompiles on change and restarts via `nodemon`.

## Configuration

- **Environment variables** are defined in `src/store/envloader.ts`. Important settings include SMTP credentials, API host/port, the config directory path, and database options.
- **Config directory** (`CONFIG_PATH`) contains JSON seed data (`init-data.json`), optional API key files, and template assets. Each domain now lives directly under the config root (for example `config/example.com/form-template/…`). Review `config-example/` for the recommended layout, in particular the `form-template/` and `tx-template/` folders used for compiled Nunjucks templates.
- **Database** defaults to SQLite (`maildata.db`). You can switch dialects by updating the environment options if your deployment requires another database.

When `DB_AUTO_RELOAD` is enabled the service watches `init-data.json` and refreshes templates and forms without a restart.

## API Overview

| Method | Path                | Description                                   |
| ------ | ------------------- | --------------------------------------------- |
| POST   | `/v1/tx/template`   | Store or update a transactional mail template |
| POST   | `/v1/tx/message`    | Render and send a stored transactional mail   |
| POST   | `/v1/form/template` | Store or update a form submission template    |
| POST   | `/v1/form/message`  | Submit a form payload and deliver the email   |

All authenticated routes expect an API token associated with a configured user. Attachments can be uploaded alongside the `/v1/tx/message` request and are forwarded by Nodemailer.

## Available Scripts

- `npm run dev` – Start the API server in watch mode
- `npm run build` – Compile TypeScript to the `dist/` directory
- `npm run start` – Launch the compiled server from `dist/`
- `npm run lint` – Lint the project with ESLint
- `npm run format` – Apply ESLint autofixes followed by Prettier formatting
- `npm run cleanbuild` – Clean, lint, format, and rebuild the project

## Repository & Support

- Repository: https://github.com/technomoron/mail-magic
- Issues: https://github.com/technomoron/mail-magic/issues

## License

This project is released under the MIT License. See the [LICENSE](LICENSE) file for details.

## Copyright

Copyright (c) 2025 Bjørn Erik Jacobsen. All rights reserved.
