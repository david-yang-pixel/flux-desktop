// electron-builder afterPack hook: sign the .app before the DMG is built.
// Ad-hoc signature by default (no certificate needed; required to run on Apple Silicon
// and lets the updater check the bundle is intact). Set SIGN_IDENTITY to use a certificate.
const { execFileSync } = require('child_process');
const path = require('path');

exports.default = async function sign(context) {
  if (context.electronPlatformName !== 'darwin' || process.platform !== 'darwin') return;
  const app = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.app`);
  const identity = process.env.SIGN_IDENTITY || '-';
  console.log(`  • signing ${app} with ${identity === '-' ? 'ad-hoc signature' : `identity ${identity}`}`);
  execFileSync('codesign', ['--force', '--deep', '--timestamp=none', '--sign', identity, app], { stdio: 'inherit' });
  execFileSync('codesign', ['--verify', '--deep', '--strict', app], { stdio: 'inherit' });
  execFileSync('codesign', ['-d', '-r-', app], { stdio: 'inherit' });
};
