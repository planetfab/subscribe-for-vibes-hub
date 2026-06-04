require('dotenv').config();

module.exports = {
  port: process.env.PORT || 3000,
  sessionSecret: process.env.SESSION_SECRET || 'dev-secret-change-in-production',

  users: {
    fabrice: process.env.FABRICE_PASSWORD,
    michelle: process.env.MICHELLE_PASSWORD,
  },

  anthropicApiKey: process.env.ANTHROPIC_API_KEY,

  imap: {
    host: process.env.IMAP_HOST || 'mail.dreamhost.com',
    port: parseInt(process.env.IMAP_PORT || '993', 10),
    secure: true,
    user: process.env.IMAP_USER || 'buzzby@planetfab.com',
    password: process.env.IMAP_PASSWORD,
  },

  database: {
    url: process.env.DATABASE_URL,
  },

  linkedin: {
    clientId: process.env.LINKEDIN_CLIENT_ID,
    clientSecret: process.env.LINKEDIN_CLIENT_SECRET,
    redirectUri: process.env.LINKEDIN_REDIRECT_URI || 'https://hub.planetfab.com/auth/linkedin/callback',
    fabriceToken: process.env.LINKEDIN_FABRICE_TOKEN,
    fabriceUrn: process.env.LINKEDIN_FABRICE_URN,
    michelleToken: process.env.LINKEDIN_MICHELLE_TOKEN,
    michelleUrn: process.env.LINKEDIN_MICHELLE_URN,
    planetfabPageId: process.env.LINKEDIN_PLANETFAB_PAGE_ID,
    planetfabToken: process.env.LINKEDIN_PLANETFAB_TOKEN,
  },

  meta: {
    appId: process.env.META_APP_ID || '962437633354825',
    appSecret: process.env.META_APP_SECRET,
    instagramToken: process.env.INSTAGRAM_ACCESS_TOKEN,
    instagramAccountId: process.env.INSTAGRAM_ACCOUNT_ID,
  },
};
