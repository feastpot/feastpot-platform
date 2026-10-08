# Braces advisory: scoped build-tooling risk acceptance

Date: 7 October 2026

## Finding

The dependency audit reports `GHSA-vfj7-8cjw-p6xm`: deeply nested brace patterns
can exhaust the stack. Installed braces is 3.0.3, within the advisory's affected
range. Registry checks on this date returned braces 3.0.3, micromatch 4.0.8 and
the PWA plugin 10.2.9 as their latest releases. No patched upgrade was available.

The production-dependency audit reports the affected chain through next-sitemap.
Other installed chains include the PWA plugin, Tailwind and development tooling.
Declaring a dependency as tooling does not by itself establish a runtime boundary.

## Observed runtime boundary and remediation

Before the change, importing the real PWA plugin loaded braces through
`node_modules/micromatch/index.js`. The customer Next configuration imported
that plugin unconditionally, including when loading server configuration.
Its `disable` option did not prevent the dependency from being imported.

The configuration now dynamically imports the PWA plugin only for
`PHASE_PRODUCTION_BUILD`. Production serving and development configuration return
the existing Next configuration without importing the plugin. The build retains
the PWA wrapper and all existing PWA options. The optional bundle analyser is also
restricted to the production build phase.

The next-sitemap CLI is invoked by the customer's postbuild script, not by an
application route. No request-handler import of next-sitemap, micromatch or
braces was found across the four application source directories.

## Evidence

Run:

```sh
node scripts/verify-braces-config-runtime.mjs
```

The probe intercepts actual module loading and exercises the real configuration:

- Production server and development server phases: zero external braces loads.
- Production build phase: braces loads through micromatch.
- The production build configuration retains its webpack hook.
- The probe requires the build-time load to occur, so an inert probe cannot pass.

This is local configuration-loader evidence. It is not a claim that the deployed
customer runtime has changed, nor a complete audit of vendored code inside Next.
The full PWA production build and offline behaviour have not yet been exercised
after this change.

## Accepted scope and controls

The user's audit instruction permits formal acceptance for build tooling only.
The accepted residual risk is the affected external braces dependency in the
build pipeline, after its removal from this application's serving configuration
path. This is not a blanket acceptance of production exposure.

Build patterns must remain controlled by repository configuration. Customer input,
vendor menu text, upload names and HTTP parameters must not be used as brace/glob
patterns. Uploads remain in remote storage, not the build's public-directory scan.

Do not suppress the dependency finding. Reassess when a patched release becomes
available, if the configuration boundary changes, or before 6 November 2026.
Any future request-time import of the affected dependency invalidates acceptance.

Production rollout and a full production-build check remain outstanding.
