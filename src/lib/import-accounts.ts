import { Institution } from '@prisma/client';
import { prisma } from '@/lib/prisma';

export function getDefaultAccountName(institution: Institution): string {
  const names: Record<Institution, string> = {
    BANK_HAPOALIM: 'בנק הפועלים',
    BANK_LEUMI: 'בנק לאומי',
    ISRACARD: 'ישראכרט',
    LEUMI_CARD: 'לאומי קארד',
    OTHER: 'חשבון אחר',
  };

  return names[institution];
}

export async function resolveOrCreateImportAccount({
  institution,
  cardNumber,
  accountNameOverride,
}: {
  institution: Institution;
  cardNumber?: string;
  accountNameOverride?: string | null;
}) {
  let account = await prisma.account.findFirst({
    where: {
      institution,
      cardNumber: cardNumber || null,
    },
  });

  if (!account && cardNumber) {
    const existingAccount = await prisma.account.findFirst({
      where: {
        institution,
        cardNumber: null,
      },
    });

    if (existingAccount) {
      const baseName = accountNameOverride || getDefaultAccountName(institution);
      account = await prisma.account.update({
        where: { id: existingAccount.id },
        data: {
          cardNumber,
          name: `${baseName} - ${cardNumber}`,
        },
      });
    }
  }

  if (!account) {
    const baseName = accountNameOverride || getDefaultAccountName(institution);
    const fullName = cardNumber ? `${baseName} - ${cardNumber}` : baseName;

    account = await prisma.account.create({
      data: {
        name: fullName,
        institution,
        cardNumber: cardNumber || null,
      },
    });
  }

  return account;
}
