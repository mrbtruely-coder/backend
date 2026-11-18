const { PrismaClient } = require('@prisma/client');
const fs = require('fs');
const prisma = new PrismaClient();

async function run() {
  const deities = await prisma.deity.findMany({ orderBy: { orderIndex: 'asc' } });
  let sql = '\n--\n-- Table structure for table `deities`\n--\n\n' +
    'CREATE TABLE IF NOT EXISTS `deities` (\n' +
    '  `id` int(11) NOT NULL AUTO_INCREMENT,\n' +
    '  `slug` varchar(100) NOT NULL UNIQUE,\n' +
    '  `name` varchar(255) NOT NULL,\n' +
    '  `telugu_name` varchar(255) DEFAULT NULL,\n' +
    '  `tamil_name` varchar(255) DEFAULT NULL,\n' +
    '  `kannada_name` varchar(255) DEFAULT NULL,\n' +
    '  `hindi_name` varchar(255) DEFAULT NULL,\n' +
    '  `description` text DEFAULT NULL,\n' +
    '  `category` varchar(50) NOT NULL DEFAULT \'popular\',\n' +
    '  `image_url` varchar(500) DEFAULT NULL,\n' +
    '  `image_name` varchar(255) DEFAULT NULL,\n' +
    '  `aliases` text DEFAULT NULL,\n' +
    '  `is_featured` tinyint(1) NOT NULL DEFAULT 0,\n' +
    '  `order_index` int(11) NOT NULL DEFAULT 0,\n' +
    '  `is_active` tinyint(1) NOT NULL DEFAULT 1,\n' +
    '  `created_at` datetime(3) NOT NULL DEFAULT current_timestamp(3),\n' +
    '  `updated_at` datetime(3) NOT NULL DEFAULT current_timestamp(3) ON UPDATE current_timestamp(3),\n' +
    '  PRIMARY KEY (`id`),\n' +
    '  KEY `deities_category_idx` (`category`),\n' +
    '  KEY `deities_is_featured_idx` (`is_featured`),\n' +
    '  KEY `deities_is_active_idx` (`is_active`),\n' +
    '  KEY `deities_order_index_idx` (`order_index`)\n' +
    ') ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;\n\n' +
    '--\n-- Dumping data for table `deities`\n--\n\n' +
    'INSERT INTO `deities` (`id`, `slug`, `name`, `telugu_name`, `tamil_name`, `kannada_name`, `hindi_name`, `description`, `category`, `image_url`, `image_name`, `aliases`, `is_featured`, `order_index`, `is_active`) VALUES\n';
  
  const rows = deities.map(d => {
    const esc = (val) => val === null || val === undefined ? 'NULL' : '\'' + String(val).replace(/'/g, "\\'") + '\'';
    return '(' + [
      d.id,
      esc(d.slug),
      esc(d.name),
      esc(d.teluguName),
      esc(d.tamilName),
      esc(d.kannadaName),
      esc(d.hindiName),
      esc(d.description),
      esc(d.category),
      esc(d.imageUrl),
      esc(d.imageName),
      esc(d.aliases),
      d.isFeatured ? 1 : 0,
      d.orderIndex,
      d.isActive ? 1 : 0
    ].join(', ') + ')';
  });

  sql += rows.join(',\n') + '\nON DUPLICATE KEY UPDATE `name`=VALUES(`name`), `telugu_name`=VALUES(`telugu_name`), `image_name`=VALUES(`image_name`);\n\n';
  fs.appendFileSync('ayyappa_aradhana_dump.sql', sql);
  fs.appendFileSync('ayyappa_aradhana_cpanel.sql', sql);
  console.log('Appended deities SQL dump with', deities.length, 'records!');
  await prisma.$disconnect();
}
run().catch(e => { console.error(e); process.exit(1); });
