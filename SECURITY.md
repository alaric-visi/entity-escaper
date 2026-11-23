# Security policy

Entity Escaper runs entirely in the browser and has no server component. The security-relevant parts are:

- the **preview frame**, which renders user-supplied HTML in an `<iframe sandbox="">` with a `default-src 'none'` policy
- the page's **Content Security Policy** (generated in `vite.config.js`)
- the **escaping functions** themselves, where a wrong output could lead to cross-site scripting in someone else's site

## Reporting a vulnerability

<!-- Maintainers: private reporting must be switched on under Settings → Code security → Private vulnerability reporting. -->

Please **don't open a public issue**. Use GitHub's private reporting instead: the repository's **Security** tab → **Report a vulnerability**. Include the input, the format, direction and options, and what happens.

Examples of issues we'd like to hear about:

- script execution or network access from the preview frame
- a way to run script in the app page itself
- escaping output that isn't safe in the context its guidance says it's safe for. For example, HTML "attribute" mode output that can break out of a quoted attribute.

We'll reply as soon as we can and credit you in the changelog if you'd like.

## Supported versions

Only the latest release on the default branch is supported.
