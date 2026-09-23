import { defineConfig } from 'astro/config';
import vercel from '@astrojs/vercel';

export default defineConfig({
  output: 'server',
  adapter: vercel(),

  security: {
    // Same as teaching: without this, Astro's CSRF check rejects the login
    // form's POST on Vercel. Add any custom domain here too.
    allowedDomains: [{ hostname: '**.vercel.app', protocol: 'https' }],
  },
});
