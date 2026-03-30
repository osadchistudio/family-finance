import 'dotenv/config';
import { runReceiptImageCleanup } from '../src/lib/receipt-image-cleanup';

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  const retentionArg = process.argv.find(argument => argument.startsWith('--retention-days='));
  const retentionDays = retentionArg
    ? Number(retentionArg.split('=')[1])
    : undefined;

  const result = await runReceiptImageCleanup({
    dryRun,
    retentionDays,
  });

  console.log('=== Receipt Image Cleanup ===');
  console.log(`Dry run: ${result.dryRun ? 'yes' : 'no'}`);
  console.log(`Retention days: ${result.retentionDays}`);
  console.log(`Cutoff: ${result.cutoffIso}`);
  console.log(`Candidates: ${result.candidates}`);
  console.log(`Cleaned receipts: ${result.cleanedReceipts}`);
  console.log(`Deleted files: ${result.deletedFiles}`);
  console.log(`Missing files: ${result.missingFiles}`);
  console.log(`Reclaimed bytes: ${result.reclaimedBytes}`);
}

main().catch((error) => {
  console.error('Receipt image cleanup failed:', error);
  process.exitCode = 1;
});
