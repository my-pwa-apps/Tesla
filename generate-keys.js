// Generate Tesla Fleet API Keys
const crypto = require('crypto');
const fs = require('fs');

// Generate ECDSA key pair
const { privateKey, publicKey } = crypto.generateKeyPairSync('ec', {
    namedCurve: 'prime256v1',
    publicKeyEncoding: {
        type: 'spki',
        format: 'pem'
    },
    privateKeyEncoding: {
        type: 'pkcs8',
        format: 'pem'
    }
});

// Save private key
fs.writeFileSync('private-key.pem', privateKey);
console.log('✅ Private key saved to private-key.pem');
console.log('⚠️  Keep this file SECRET - do not commit to git!');

// Save public key
fs.writeFileSync('public-key.pem', publicKey);
console.log('✅ Public key saved to public-key.pem');

// Also save to .well-known directory for hosting
const wellKnownDir = '.well-known/appspecific';
if (!fs.existsSync(wellKnownDir)) {
    fs.mkdirSync(wellKnownDir, { recursive: true });
}
fs.writeFileSync(`${wellKnownDir}/com.tesla.3p.public-key.pem`, publicKey);
console.log('✅ Public key copied to .well-known/appspecific/com.tesla.3p.public-key.pem');
console.log('\n📋 Next steps:');
console.log('1. Commit and push the .well-known directory');
console.log('2. Verify key is accessible at: https://my-pwa-apps.github.io/Tesla/.well-known/appspecific/com.tesla.3p.public-key.pem');
console.log('3. Call Tesla Fleet API register endpoint');
