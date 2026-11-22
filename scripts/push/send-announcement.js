#!/usr/bin/env node
/* eslint-disable no-undef */
/**
 * Maintainer CLI: Send an anonymous topic push announcement to registered
 * Android (FCM HTTP v1) and iOS (APNs) devices stored in `public.push_devices`.
 *
 * Usage:
 *   node scripts/push/send-announcement.js \
 *     --title "Food catalog updated" \
 *     --body "1,200 new verified foods added to online search." \
 *     [--topic announcements] \
 *     [--route open_home] \
 *     [--dry-run]
 *
 * Required environment variables:
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Android (FCM HTTP v1):
 *   FCM_SERVICE_ACCOUNT_JSON  (stringified Google service account JSON)
 *
 * iOS (APNs token-based auth):
 *   APNS_KEY_P8               (PEM contents of your AuthKey_*.p8)
 *   APNS_KEY_ID               (10-char Apple Key ID)
 *   APNS_TEAM_ID              (10-char Apple Team ID)
 *   APNS_BUNDLE_ID            (default: com.energymap.tracker)
 *   APNS_USE_SANDBOX          ("true" for Xcode debug builds)
 */
import crypto from 'node:crypto';
import http2 from 'node:http2';

const parseArgs = (argv) => {
  const args = {
    topic: 'announcements',
    route: 'open_home',
    dryRun: false,
    title: '',
    body: '',
  };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dry-run') {
      args.dryRun = true;
    } else if (token === '--title') {
      args.title = argv[i + 1] ?? '';
      i += 1;
    } else if (token === '--body') {
      args.body = argv[i + 1] ?? '';
      i += 1;
    } else if (token === '--topic') {
      args.topic = argv[i + 1] ?? 'announcements';
      i += 1;
    } else if (token === '--route') {
      args.route = argv[i + 1] ?? 'open_home';
      i += 1;
    }
  }
  return args;
};

const base64Url = (input) =>
  Buffer.from(input)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

const fetchSubscribedDevices = async ({ supabaseUrl, serviceKey, topic }) => {
  const url = new URL('/rest/v1/push_devices', supabaseUrl);
  url.searchParams.set('select', 'installation_id,platform,token');
  url.searchParams.set('topics', `cs.{${topic}}`);

  const response = await fetch(url.toString(), {
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
      Accept: 'application/json',
    },
  });
  if (!response.ok) {
    throw new Error(`Supabase query failed: ${response.status}`);
  }
  return response.json();
};

const pruneStaleDevice = async ({
  supabaseUrl,
  serviceKey,
  installationId,
}) => {
  const url = new URL('/rest/v1/push_devices', supabaseUrl);
  url.searchParams.set('installation_id', `eq.${installationId}`);
  await fetch(url.toString(), {
    method: 'DELETE',
    headers: {
      apikey: serviceKey,
      Authorization: `Bearer ${serviceKey}`,
    },
  });
};

const mintFcmAccessToken = async (serviceAccount) => {
  const now = Math.floor(Date.now() / 1000);
  const header = base64Url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claimSet = base64Url(
    JSON.stringify({
      iss: serviceAccount.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: now,
      exp: now + 3600,
    })
  );
  const signingInput = `${header}.${claimSet}`;
  const signature = crypto
    .sign('RSA-SHA256', Buffer.from(signingInput), serviceAccount.private_key)
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');

  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: `${signingInput}.${signature}`,
    }),
  });
  const payload = await response.json();
  if (!response.ok || !payload.access_token) {
    throw new Error(`FCM OAuth2 failed: ${JSON.stringify(payload)}`);
  }
  return payload.access_token;
};

const sendFcmMessage = async ({
  projectId,
  accessToken,
  token,
  title,
  body,
  route,
}) => {
  const response = await fetch(
    `https://fcm.googleapis.com/v1/projects/${projectId}/messages:send`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        message: {
          token,
          notification: { title, body },
          android: {
            notification: {
              channel_id: 'energy_map_announcements_v2',
            },
          },
          data: { route },
        },
      }),
    }
  );
  if (response.ok) {
    return { ok: true, invalidToken: false };
  }
  const err = await response.json().catch(() => ({}));
  const errorCode = err?.error?.details?.[0]?.errorCode || err?.error?.status;
  return {
    ok: false,
    invalidToken:
      response.status === 404 ||
      errorCode === 'UNREGISTERED' ||
      errorCode === 'INVALID_ARGUMENT',
    error: err,
  };
};

const mintApnsJwt = ({ keyP8, keyId, teamId }) => {
  const header = base64Url(JSON.stringify({ alg: 'ES256', kid: keyId }));
  const claims = base64Url(
    JSON.stringify({ iss: teamId, iat: Math.floor(Date.now() / 1000) })
  );
  const signingInput = `${header}.${claims}`;
  const signature = crypto
    .sign('SHA256', Buffer.from(signingInput), {
      key: keyP8,
      dsaEncoding: 'ieee-p1363',
    })
    .toString('base64')
    .replace(/=/g, '')
    .replace(/\+/g, '-')
    .replace(/\//g, '_');
  return `${signingInput}.${signature}`;
};

const sendApnsMessage = ({ host, jwt, bundleId, token, title, body, route }) =>
  new Promise((resolve) => {
    const client = http2.connect(`https://${host}`);
    const payload = JSON.stringify({
      aps: { alert: { title, body }, sound: 'default' },
      route,
    });
    const req = client.request({
      ':method': 'POST',
      ':path': `/3/device/${token}`,
      authorization: `bearer ${jwt}`,
      'apns-topic': bundleId,
      'apns-push-type': 'alert',
      'content-type': 'application/json',
    });

    let status = 0;
    let data = '';
    req.on('response', (headers) => {
      status = Number(headers[':status'] || 0);
    });
    req.on('data', (chunk) => {
      data += chunk;
    });
    req.on('end', () => {
      client.close();
      resolve({
        ok: status >= 200 && status < 300,
        invalidToken: status === 410 || status === 400,
        status,
        data,
      });
    });
    req.on('error', (error) => {
      client.close();
      resolve({ ok: false, invalidToken: false, error: error.message });
    });
    req.write(payload);
    req.end();
  });

const main = async () => {
  const args = parseArgs(process.argv.slice(2));
  if (!args.title.trim() || !args.body.trim()) {
    console.error('Both --title and --body are required.');
    process.exit(1);
  }

  const supabaseUrl = String(process.env.SUPABASE_URL || '').trim();
  const serviceKey = String(process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim();
  if (!supabaseUrl || !serviceKey) {
    console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY.');
    process.exit(1);
  }

  const devices = await fetchSubscribedDevices({
    supabaseUrl,
    serviceKey,
    topic: args.topic,
  });
  console.log(
    `Found ${devices.length} device(s) subscribed to "${args.topic}".`
  );
  if (args.dryRun || devices.length === 0) {
    return;
  }

  const fcmJson = process.env.FCM_SERVICE_ACCOUNT_JSON;
  const serviceAccount = fcmJson ? JSON.parse(fcmJson) : null;
  const fcmAccessToken = serviceAccount
    ? await mintFcmAccessToken(serviceAccount)
    : null;

  const apnsKeyP8 = process.env.APNS_KEY_P8;
  const apnsKeyId = process.env.APNS_KEY_ID;
  const apnsTeamId = process.env.APNS_TEAM_ID;
  const apnsBundleId = process.env.APNS_BUNDLE_ID || 'com.energymap.tracker';
  const apnsHost =
    process.env.APNS_USE_SANDBOX === 'true'
      ? 'api.sandbox.push.apple.com'
      : 'api.push.apple.com';
  const apnsJwt =
    apnsKeyP8 && apnsKeyId && apnsTeamId
      ? mintApnsJwt({
          keyP8: apnsKeyP8.replace(/\\n/g, '\n'),
          keyId: apnsKeyId,
          teamId: apnsTeamId,
        })
      : null;

  let sent = 0;
  let pruned = 0;
  let failed = 0;

  for (const device of devices) {
    let result = { ok: false, invalidToken: false };
    if (device.platform === 'android') {
      if (!fcmAccessToken) {
        console.warn(
          'Skipping Android device: FCM_SERVICE_ACCOUNT_JSON unset.'
        );
        continue;
      }
      result = await sendFcmMessage({
        projectId: serviceAccount.project_id,
        accessToken: fcmAccessToken,
        token: device.token,
        title: args.title,
        body: args.body,
        route: args.route,
      });
    } else if (device.platform === 'ios') {
      if (!apnsJwt) {
        console.warn('Skipping iOS device: APNS_* env vars unset.');
        continue;
      }
      result = await sendApnsMessage({
        host: apnsHost,
        jwt: apnsJwt,
        bundleId: apnsBundleId,
        token: device.token,
        title: args.title,
        body: args.body,
        route: args.route,
      });
    }

    if (result.ok) {
      sent += 1;
    } else if (result.invalidToken) {
      await pruneStaleDevice({
        supabaseUrl,
        serviceKey,
        installationId: device.installation_id,
      });
      pruned += 1;
    } else {
      failed += 1;
    }
  }

  console.log(`Done: ${sent} sent, ${pruned} stale pruned, ${failed} failed.`);
};

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
