const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
  console.log('Updating deities order and names...');

  // 1. Lord Ayyappa
  await prisma.deity.updateMany({
    where: { slug: 'ayyappa' },
    data: {
      orderIndex: 1,
      isFeatured: true,
      name: 'Lord Ayyappa',
      teluguName: 'అయ్యప్ప స్వామి',
    },
  });

  // 2. Lord Shiva
  await prisma.deity.updateMany({
    where: { slug: 'shiva' },
    data: {
      orderIndex: 2,
      isFeatured: true,
      name: 'Lord Shiva',
      teluguName: 'పరమ శివుడు',
    },
  });

  // 3. Lord Ganapathi
  await prisma.deity.updateMany({
    where: { slug: 'ganesha' },
    data: {
      orderIndex: 3,
      isFeatured: true,
      name: 'Lord Ganapathi',
      teluguName: 'గణపతి',
    },
  });

  // 4. Lord Karthikeya
  await prisma.deity.updateMany({
    where: { slug: 'murugan' },
    data: {
      orderIndex: 4,
      isFeatured: true,
      name: 'Lord Karthikeya',
      teluguName: 'కార్తికేయుడు',
    },
  });

  // 5. Lord Vishnu
  await prisma.deity.updateMany({
    where: { slug: 'vishnu' },
    data: {
      orderIndex: 5,
      isFeatured: true,
    },
  });

  // 6. Goddess Devi
  await prisma.deity.updateMany({
    where: { slug: 'devi' },
    data: {
      orderIndex: 6,
      isFeatured: true,
    },
  });

  const updated = await prisma.deity.findMany({
    select: { id: true, slug: true, name: true, orderIndex: true, isFeatured: true },
    orderBy: { orderIndex: 'asc' },
    take: 8,
  });

  console.log('Top Deities:', updated);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
