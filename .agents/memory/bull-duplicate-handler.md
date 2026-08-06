---
name: Bull duplicate handler root cause
description: Why "Cannot define the same handler twice" fires at boot and how to prevent it
---

## The rule
`BullModule.registerQueue()` may only be called from ONE place per queue name. That one place is `QueuesModule`. Every other module must rely on the globally-exported queue token from `QueuesModule`; never call `registerQueue` again.

## Why
`BullModule.registerQueue()` internally imports `BullModule.registerCore()`, which provides `BullExplorer`. `registerCore()` returns a **new plain object** every time it is called. NestJS uses `ByReferenceModuleOpaqueKeyFactory` which caches module tokens via a Symbol stored **on that object reference**. A new object has no cached Symbol, so a fresh random token is generated. Two calls → two distinct tokens → two separate NestJS `BullModule` module instances, each with its own `BullExplorer` instance. Both `BullExplorer` instances run `onModuleInit()` → `explore()` and try to register the same `@Process` handlers on the same Bull queue object → `Queue.setHandler` throws "Cannot define the same handler twice".

The same mechanism applies to `NotificationsModule` (`@Global()`): if any feature module re-imports it in its `imports` array, a second `BullExplorer` scan of `NotificationProcessor` occurs because the `@Global` provider is now reachable from two module graph paths.

## How to apply
1. **QueuesModule only**: keep all `BullModule.registerQueue({ name: SOME_QUEUE })` calls inside `QueuesModule`. Mark `QueuesModule` as `@Global()` and export the queue tokens.
2. **Never re-import @Global modules**: `NotificationsModule`, `PrismaModule`, `StripeModule`, and any other `@Global()` module must NOT appear in feature-module `imports` arrays.
3. **Processor isolation**: if a processor class is used by a module that is imported transitively by many other modules (e.g. `PaymentsModule` via `forwardRef` from `OrdersModule`), extract the processor into a dedicated module (`StripeWebhookProcessorModule`) that is imported only once at the top level in `AppModule`.
4. **Diagnosis**: patch `@nestjs/core/discovery/discovery-service.js` to log `modules.length` and `StripeWebhookProcessorModule count` at the start of `getProviders()`. If `getProviders()` is called N times, there are N `BullExplorer` instances.

**Why:** Each extra `BullExplorer` re-registers all `@Process` handlers. The first registration succeeds; the second throws.
