import { PrismaClient, CategoryType } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import 'dotenv/config';

const adapter = new PrismaPg({ connectionString: process.env.DATABASE_URL });
const prisma = new PrismaClient({ adapter });

const categories = [
  // הוצאות
  {
    name: 'מכולת',
    nameEn: 'Groceries',
    icon: '🛒',
    color: '#22C55E',
    type: CategoryType.EXPENSE,
    sortOrder: 1,
    keywords: [
      'שופרסל', 'רמי לוי', 'מגה', 'יוחננוף', 'ויקטורי', 'אושר עד',
      'חצי חינם', 'יינות ביתן', 'טיב טעם', 'קרפור', 'מחסני השוק',
      'גודמן', 'פרש מרקט', 'ברקת', 'סופר', 'מרקט', 'מינימרקט'
    ]
  },
  {
    name: 'מסעדות וקפה',
    nameEn: 'Restaurants & Cafe',
    icon: '🍽️',
    color: '#F97316',
    type: CategoryType.EXPENSE,
    sortOrder: 2,
    keywords: [
      'מקדונלדס', 'ארומה', 'קפה קפה', 'גרג', 'קופי בין', 'לנדוור',
      'בורגר', 'פיצה', 'שווארמה', 'פלאפל', 'סושי', 'מסעדה',
      'קפה', 'בית קפה', 'דומינוס', 'פאפא ג\'ונס', 'ווק', 'KFC',
      'burger king', 'mcdonalds', 'אגדיר', 'שיפודי', 'גריל'
    ]
  },
  {
    name: 'דלק',
    nameEn: 'Fuel',
    icon: '⛽',
    color: '#DC2626',
    type: CategoryType.EXPENSE,
    sortOrder: 3,
    keywords: [
      'דלק', 'פז', 'סונול', 'דור אלון', 'ten', 'אלון', 'yellow',
      'דלק דלק', 'תדיראן', 'דור', 'sonol', 'paz', 'delek'
    ]
  },
  {
    name: 'תחבורה',
    nameEn: 'Transportation',
    icon: '🚗',
    color: '#3B82F6',
    type: CategoryType.EXPENSE,
    sortOrder: 4,
    keywords: [
      'גט טקסי', 'יאנגו', 'רכבת ישראל', 'אגד', 'דן', 'מטרופולין',
      'קווים', 'אופניים', 'ליים', 'בירד', 'חניה', 'חנייה', 'פנגו',
      'רב קו', 'cellopark', 'איזיפארק', 'gett', 'yango', 'bolt'
    ]
  },
  {
    name: 'דיגיטל',
    nameEn: 'Digital Services',
    icon: '💻',
    color: '#0891B2',
    type: CategoryType.EXPENSE,
    sortOrder: 5,
    keywords: [
      'נטפליקס', 'netflix', 'ספוטיפיי', 'spotify', 'אמזון פריים', 'amazon prime',
      'דיסני', 'disney', 'אפל', 'apple', 'גוגל', 'google', 'מיקרוסופט', 'microsoft',
      'יוטיוב', 'youtube', 'HBO', 'hbo max', 'chatgpt', 'openai',
      'dropbox', 'icloud', 'אפליקציה', 'מנוי דיגיטלי', 'סטרימינג'
    ]
  },
  {
    name: 'חשבונות בית',
    nameEn: 'Utilities',
    icon: '🏠',
    color: '#8B5CF6',
    type: CategoryType.EXPENSE,
    sortOrder: 6,
    keywords: [
      'חברת החשמל', 'חשמל', 'מקורות', 'מים', 'תאגיד מים',
      'פזגז', 'אמישראגז', 'סופרגז', 'גז', 'ארנונה', 'עירייה',
      'ועד בית'
    ]
  },
  {
    name: 'תקשורת',
    nameEn: 'Telecom',
    icon: '📱',
    color: '#06B6D4',
    type: CategoryType.EXPENSE,
    sortOrder: 7,
    keywords: [
      'פרטנר', 'סלקום', 'פלאפון', 'הוט', 'בזק', 'yes', 'גולן',
      '012', '013', '019', 'אקספון', 'רמי לוי תקשורת', 'cellcom',
      'partner', 'hot mobile'
    ]
  },
  {
    name: 'בריאות',
    nameEn: 'Health',
    icon: '🏥',
    color: '#EC4899',
    type: CategoryType.EXPENSE,
    sortOrder: 8,
    keywords: [
      'מכבי', 'כללית', 'מאוחדת', 'לאומית', 'קופת חולים',
      'סופר פארם', 'בית מרקחת', 'פארם', 'רופא', 'מרפאה',
      'בי קיור', 'גד', 'ניו פארם', 'אופטיקה'
    ]
  },
  {
    name: 'ביטוח',
    nameEn: 'Insurance',
    icon: '🛡️',
    color: '#64748B',
    type: CategoryType.EXPENSE,
    sortOrder: 9,
    keywords: [
      'מגדל', 'הראל', 'כלל', 'הפניקס', 'מנורה', 'איילון',
      'ביטוח', 'insurance', 'AIG', 'שירביט', 'אקסלנס'
    ]
  },
  {
    name: 'חינוך',
    nameEn: 'Education',
    icon: '📚',
    color: '#F59E0B',
    type: CategoryType.EXPENSE,
    sortOrder: 10,
    keywords: [
      'גן ילדים', 'צהרון', 'חוגים', 'בית ספר', 'אוניברסיטה',
      'מכללה', 'קורס', 'שכר לימוד', 'תל אביב', 'עברית', 'בר אילן'
    ]
  },
  {
    name: 'ביגוד והנעלה',
    nameEn: 'Clothing & Shoes',
    icon: '👕',
    color: '#E11D48',
    type: CategoryType.EXPENSE,
    sortOrder: 11,
    keywords: [
      'זארה', 'ZARA', 'H&M', 'קסטרו', 'גולף', 'FOX', 'אמריקן איגל',
      'pull&bear', 'מנגו', 'NEXT', 'רנואר', 'תמנון', 'הודיס',
      'טרמינל X', 'SHEIN', 'נעלי', 'shoes', 'scoop', 'סקופ',
      'נייק', 'אדידס', 'nike', 'adidas', 'puma', 'פומה', 'נעליים',
      'בגדים', 'אופנה', 'ASOS', 'סטרדיווריוס', 'ברשקה', 'bershka'
    ]
  },
  {
    name: 'קניות כלליות',
    nameEn: 'Shopping',
    icon: '🛍️',
    color: '#A855F7',
    type: CategoryType.EXPENSE,
    sortOrder: 12,
    keywords: [
      'עזריאלי', 'קניון', 'איקאה', 'הום סנטר', 'אייס',
      'ACE', 'IKEA', 'עליאקספרס', 'אמזון', 'KSP', 'באג',
      'מחסני חשמל', 'שקם אלקטריק', 'idigital', 'bug'
    ]
  },
  {
    name: 'בידור ופנאי',
    nameEn: 'Entertainment',
    icon: '🎬',
    color: '#EF4444',
    type: CategoryType.EXPENSE,
    sortOrder: 13,
    keywords: [
      'סינמה', 'יס פלאנט', 'קולנוע', 'הופעה', 'כרטיסים',
      'סיני', 'פארק', 'מוזיאון', 'תיאטרון', 'הצגה', 'לונה פארק',
      'eventim', 'leaan'
    ]
  },
  {
    name: 'העברות',
    nameEn: 'Transfers',
    icon: '🔄',
    color: '#78716C',
    type: CategoryType.TRANSFER,
    sortOrder: 14,
    keywords: [
      'העברה ל', 'העברה מ', 'bit', 'ביט', 'paybox', 'פייבוקס',
      'pepper', 'פפר', 'העברת', 'מזומן'
    ]
  },
  {
    name: 'משיכת מזומן',
    nameEn: 'ATM Withdrawal',
    icon: '💵',
    color: '#84CC16',
    type: CategoryType.EXPENSE,
    sortOrder: 15,
    keywords: [
      'משיכת מזומן', 'כספומט', 'ATM', 'משיכה'
    ]
  },
  // הכנסות
  {
    name: 'משכורת',
    nameEn: 'Salary',
    icon: '💰',
    color: '#10B981',
    type: CategoryType.INCOME,
    sortOrder: 20,
    keywords: [
      'משכורת', 'שכר', 'העברת משכורת'
    ]
  },
  {
    name: 'ביטוח לאומי',
    nameEn: 'Social Security',
    icon: '🏛️',
    color: '#0EA5E9',
    type: CategoryType.INCOME,
    sortOrder: 21,
    keywords: [
      'ביטוח לאומי', 'המוסד לביטוח לאומי', 'קצבה'
    ]
  },
  {
    name: 'הכנסות אחרות',
    nameEn: 'Other Income',
    icon: '💵',
    color: '#22D3EE',
    type: CategoryType.INCOME,
    sortOrder: 22,
    keywords: []
  }
];

async function main() {
  console.log('Seeding database...');

  for (const categoryData of categories) {
    const { keywords, ...category } = categoryData;

    const createdCategory = await prisma.category.upsert({
      where: { name: category.name },
      update: category,
      create: category
    });

    console.log(`Created category: ${createdCategory.name}`);

    // Add keywords
    for (const keyword of keywords) {
      await prisma.categoryKeyword.upsert({
        where: {
          categoryId_keyword: {
            categoryId: createdCategory.id,
            keyword: keyword
          }
        },
        update: {},
        create: {
          categoryId: createdCategory.id,
          keyword: keyword,
          isExact: false,
          priority: 0
        }
      });
    }

    console.log(`  Added ${keywords.length} keywords`);
  }

  console.log('Seeding completed!');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
