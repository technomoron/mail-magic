# Mail Magic Overview

Mail Magic is a “mail operations” service: it gives you one place to manage email templates, send transactional emails, and safely accept messages from public website forms.

It is designed for teams that want consistent email behavior across multiple apps and sites, without re-implementing template management, asset handling, and anti-abuse controls in every project.

## The Two Email Flows

### 1. Transactional email

Transactional email is the kind of message you send because something happened: a welcome message, a receipt, a password reset, a notification, an alert.

With Mail Magic you:

- keep the template and branding in one place
- send messages with per-recipient personalization
- reuse shared building blocks (headers/footers, common layout, shared assets)
- keep delivery behavior consistent across all the systems that send mail

### 2. Public form submissions

Public forms are “open to the internet” by default, which makes them a common target for spam and abuse.

Mail Magic supports form submissions as a first-class use case:

- you design the email that gets delivered when a form is submitted
- the public site submits the form using a single form identifier
- recipient routing can be controlled server-side so the public site does not need to embed real email addresses
- you can enable limits and checks to reduce spam and resource abuse

## Core Concepts

### Templates live outside your app

Mail Magic treats templates and assets as their own configuration. That means:

- you can update email presentation without shipping a new app build
- multiple products can share a single source of truth for email styling and wording
- operational ownership is clearer (marketing/comms can collaborate without touching application code)

### Domains as “workspaces”

Mail Magic is built around the idea that each sending domain can have its own:

- templates and partials
- assets (logos, images, downloadable files)
- default sender and recipient rules

This makes it straightforward to run one Mail Magic instance for multiple sites or brands.

### A public form key

For public forms, Mail Magic uses a dedicated public identifier (a “form key”) to locate the form configuration. This avoids relying on ad hoc combinations of fields and makes the contract simpler for the website.

Treat the form key like you would treat a public webhook URL: anyone who has it can submit to that form.

### Recipient routing without exposing email addresses

Sometimes a website needs a “send to: Sales / Press / Support” selector. Mail Magic supports this without forcing you to expose real email addresses in the browser:

- you define named recipients on the server
- the public form submits the chosen recipient name(s)
- the server resolves those names to real mailboxes

This reduces the risk of turning your form into an open relay and keeps addresses out of the client.

## What Mail Magic Can Do

- Manage transactional templates and send transactional messages
- Manage form templates and deliver messages from public form submissions
- Handle shared assets used by templates (logos, images, documents)
- Support multiple domains/brands in one deployment
- Support locale-specific variants of templates and behavior

## Features You’ll Care About

### Operational controls for public forms

Public forms are often a reliability and security concern. Mail Magic includes optional controls such as:

- rate limiting for bursts of submissions
- attachment count limits and upload size limits
- CAPTCHA verification
- cleanup behavior for uploaded files

You can combine these with stronger protections at the edge (CDN, reverse proxy, WAF) for best results.

### Consistent branding and reuse

Mail Magic encourages consistent presentation by making it easy to:

- reuse shared layout pieces across templates
- embed assets when needed (for email client compatibility)
- link to hosted assets when embedding is not necessary

### Clear separation of public vs private capabilities

Mail Magic separates:

- authenticated actions (managing templates, sending transactional messages, managing recipients/assets)
- the single unauthenticated action meant for the public internet (submitting a form)

This makes it easier to reason about what is safe to expose.

## The Client: What It’s For

Mail Magic includes a companion client package intended to make integration simple and repeatable.

You can use the client to:

- upload or update templates and related assets as part of a deployment process
- trigger transactional sends from your application or job runner
- submit form messages in controlled environments (for example, internal tools or test harnesses)

In practice, most teams use it in one of two ways:

- As a deployment helper: “publish the latest templates/assets and keep the service in sync.”
- As an application helper: “send transactional mail and keep email formatting out of the app.”

## Where to Learn the Exact Details

- `docs/swagger/openapi.json` contains the complete API contract in a machine-readable format.
- The running service can expose that contract via its Swagger/OpenAPI endpoint (when enabled).

