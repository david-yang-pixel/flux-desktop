// electron-builder afterPack hook: sign the .app before the DMG is built.
// SIGN_IDENTITY (set by CI from the self-signed certificate in repo secrets) keeps the
// signature identical across builds, which the in-app updater relies on. Without it the
// app is ad-hoc signed (runs on Apple Silicon, but can't self-update).
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
