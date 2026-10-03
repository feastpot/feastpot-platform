import { readFileSync } from 'fs';
import { resolve } from 'path';

import cors from 'cors';
import express from 'express';
import request from 'supertest';

import { API_CORS_ALLOWED_HEADERS } from './cors-headers';

const origin = 'https://feastpot.co.uk';
const app = express();
app.use(
  cors({
    origin: [origin],
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
    allowedHeaders: API_CORS_ALLOWED_HEADERS,
  }),
);

describe('vendor registration CORS preflight', () => {
  it.each([
    ['POST', '/v1/vendors/application-drafts'],
    ['GET', '/v1/vendors/application-drafts/resume-token'],
    ['PATCH', '/v1/vendors/application-drafts/resume-token'],
    ['POST', '/v1/vendors/application-drafts/resume-token/menu-photo'],
    ['POST', '/v1/vendors/application-drafts/resume-token/submit'],
  ])('allows the browser headers for %s %s', async (method, route) => {
    const headers = 'content-type,x-fp-anon-id,x-fp-ref,x-fp-sid';
    const response = await request(app)
      .options(route)
      .set('Origin', origin)
      .set('Access-Control-Request-Method', method)
      .set('Access-Control-Request-Headers', headers)
      .expect(204)
      .expect('Access-Control-Allow-Origin', origin)
      .expect('Access-Control-Allow-Credentials', 'true');
    const allowed = response.headers['access-control-allow-headers']
      .toLowerCase()
      .split(',')
      .map((header: string) => header.trim());
    for (const header of headers.split(',')) expect(allowed).toContain(header);
  });

  it('retains existing authentication, tracing and marketplace headers', () => {
    const allowed = API_CORS_ALLOWED_HEADERS.map((header) => header.toLowerCase());
    expect(allowed).toEqual(
      expect.arrayContaining(['authorization', 'content-type', 'x-request-id', 'x-fp-mktplace']),
    );
  });

  it('does not authorise an untrusted origin', async () => {
    const response = await request(app)
      .options('/v1/vendors/application-drafts')
      .set('Origin', 'https://untrusted.example')
      .set('Access-Control-Request-Method', 'POST')
      .set('Access-Control-Request-Headers', 'content-type,x-fp-anon-id')
      .expect(204);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('wires the tested header policy into the actual API bootstrap', () => {
    const bootstrap = readFileSync(resolve(__dirname, '../../main.ts'), 'utf8');
    expect(bootstrap).toMatch(/allowedHeaders:\s*API_CORS_ALLOWED_HEADERS/);
  });
});
