import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.info('[seed] starting…');
  await prisma.healthCheck.create({ data: { status: 'ok' } });
  console.info('[seed] done.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
