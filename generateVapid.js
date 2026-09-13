const webpush = require('web-push');
const fs = require('fs');

const envPath = '.env';
let envContent = '';

if (fs.existsSync(envPath)) {
  envContent = fs.readFileSync(envPath, 'utf8');
}

if (!envContent.includes('VAPID_PUBLIC_KEY')) {
  const vapidKeys = webpush.generateVAPIDKeys();
  fs.appendFileSync(envPath, `\nVAPID_PUBLIC_KEY=${vapidKeys.publicKey}\nVAPID_PRIVATE_KEY=${vapidKeys.privateKey}\n`);
  console.log('VAPID keys generated and appended to .env');
} else {
  console.log('VAPID keys already exist in .env');
}
