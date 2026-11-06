import bcrypt from "bcryptjs";

const pw = process.argv[2];
if (!pw || pw.length < 10) {
  console.error('Usage: npm run hash-password -- "a-strong-password (min 10 chars)"');
  process.exit(1);
}
const hash = await bcrypt.hash(pw, 12);
// Base64 so the "$" characters in bcrypt hashes are never mangled by .env variable expansion.
const b64 = Buffer.from(hash, "utf8").toString("base64");
console.log("\nAdd this line to your .env file:\n");
console.log(`AUTH_PASSWORD_HASH="${b64}"\n`);
