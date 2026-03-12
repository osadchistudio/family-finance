import { FileUploadZone } from '@/components/upload/FileUploadZone';
import { RecentUploadsList, type RecentUploadItem } from '@/components/upload/RecentUploadsList';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

async function getRecentUploads() {
  try {
    return await prisma.fileUpload.findMany({
      take: 10,
      orderBy: { processedAt: 'desc' },
      select: {
        id: true,
        filename: true,
        rowCount: true,
        status: true,
        source: true,
        processedAt: true,
        _count: {
          select: {
            transactions: true,
          },
        },
        account: {
          select: {
            name: true,
          },
        },
      },
    });
  } catch (error) {
    console.error('Upload page recent uploads load error:', error);
    return [];
  }
}

export default async function UploadPage() {
  const recentUploads = await getRecentUploads();
  const serializedRecentUploads: RecentUploadItem[] = recentUploads.map((upload) => ({
    id: upload.id,
    filename: upload.filename,
    rowCount: upload.rowCount,
    status: upload.status,
    source: upload.source,
    processedAt: upload.processedAt.toISOString(),
    accountName: upload.account.name,
    transactionCount: upload._count.transactions,
  }));

  return (
    <div className="max-w-4xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900">העלאת קבצים</h1>
        <p className="text-gray-600 mt-1">
          העלה קבצי תנועות מהבנק או מחברת האשראי שלך
        </p>
      </div>

      <div className="bg-white rounded-xl shadow-sm p-6">
        <FileUploadZone />
      </div>

      <div className="mt-8 bg-white rounded-xl shadow-sm p-6">
        <RecentUploadsList recentUploads={serializedRecentUploads} />
      </div>

      <div className="mt-8 bg-blue-50 rounded-lg p-4">
        <h3 className="font-medium text-blue-900">איך להוריד קובץ תנועות?</h3>
        <div className="mt-3 space-y-2 text-sm text-blue-800">
          <p><strong>בנק הפועלים:</strong> היכנס לחשבון → תנועות בחשבון → ייצוא לאקסל</p>
          <p><strong>בנק לאומי:</strong> היכנס לחשבון → פעולות בחשבון → הורדה לאקסל</p>
          <p><strong>ישראכרט:</strong> היכנס לאתר → פירוט חיובים → ייצוא לאקסל</p>
          <p><strong>לאומי קארד:</strong> היכנס לאתר → פירוט עסקאות → ייצוא</p>
        </div>
      </div>
    </div>
  );
}
