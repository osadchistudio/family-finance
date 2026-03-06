import { UploadSource } from '@prisma/client';
import { FileUploadZone } from '@/components/upload/FileUploadZone';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

const sourceLabels: Record<UploadSource, string> = {
  WEB: 'אתר',
  TELEGRAM: 'טלגרם',
};

const sourceClasses: Record<UploadSource, string> = {
  WEB: 'bg-slate-100 text-slate-700',
  TELEGRAM: 'bg-sky-100 text-sky-700',
};

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
        <div className="flex items-center justify-between gap-3 mb-4">
          <div>
            <h2 className="text-lg font-semibold text-gray-900">העלאות אחרונות</h2>
            <p className="text-sm text-gray-500 mt-1">
              היסטוריית העלאות אחרונה כולל מקור ההעלאה
            </p>
          </div>
          <span className="text-sm text-gray-400">{recentUploads.length} רשומות</span>
        </div>

        {recentUploads.length === 0 ? (
          <div className="rounded-lg border border-dashed border-gray-200 p-4 text-sm text-gray-500">
            עדיין אין היסטוריית העלאות להצגה
          </div>
        ) : (
          <div className="space-y-3">
            {recentUploads.map((upload) => (
              <div
                key={upload.id}
                className="flex flex-col gap-3 rounded-lg border border-gray-200 p-4 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-gray-900 break-all">{upload.filename}</span>
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${sourceClasses[upload.source]}`}
                    >
                      {sourceLabels[upload.source]}
                    </span>
                  </div>
                  <div className="mt-1 text-sm text-gray-500">
                    {upload.account.name} | {upload.rowCount} תנועות |{' '}
                    {upload.processedAt.toLocaleString('he-IL')}
                  </div>
                </div>
                <div className="text-sm text-gray-500">
                  {upload.status === 'COMPLETED' ? 'הושלם' : upload.status}
                </div>
              </div>
            ))}
          </div>
        )}
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
