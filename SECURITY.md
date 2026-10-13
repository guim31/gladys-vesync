# Security policy

## Reporting a vulnerability

Please do **not** report a security problem in a public issue, pull request or
forum post.

Report it privately through GitHub instead: open the **Security** tab of this
repository, then **Report a vulnerability**.

No such button? Private reporting is not enabled yet: open an issue that only
asks the maintainers for a private contact, without any detail of the problem,
and send the report there.

Include, when you can:

- the version of the integration and of Gladys;
- what an attacker can do, and the steps to reproduce it;
- the log lines that help (remove tokens, passwords and addresses first).

The fix ships as a new version of the integration, and the advisory is
published once users can update.

## Supported versions

Only the latest release receives security fixes: update the integration from
Gladys before reporting a problem.

## Scope

In scope: the code of this repository and the Docker image it publishes —
in particular how it handles your VeSync credentials:

- the e-mail and the password live in the Gladys configuration of the
  integration; the password leaves the container only as the MD5 hash the
  VeSync login requires, sent over HTTPS to the VeSync cloud
  (`smartapi.vesync.eu`, `smartapi.vesync.com`);
- `/data/vesync-session.json` (readable by the container user only) keeps the
  VeSync session token, the account id, region and country, a SHA-256 of the
  e-mail (to tell whose session it is) and the installation's terminal id —
  never the password nor the e-mail itself;
- the logs never contain the password, its hash, the token nor the e-mail
  (`test/hub.test.js` checks it);
- the container only talks to the VeSync cloud over HTTPS and to Gladys; it
  opens no port.

Out of scope: Gladys Assistant itself (see its
[security policy](https://github.com/GladysAssistant/Gladys/security/policy)),
the VeSync cloud and the devices (report those to VeSync).
