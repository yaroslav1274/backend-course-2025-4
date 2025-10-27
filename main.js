const http = require('http');
const fs = require('fs').promises;
const { existsSync } = require('fs');
const { program } = require('commander');
const { XMLBuilder } = require('fast-xml-parser');
const url = require('url');
const path = require('path');

program
  .requiredOption('-i, --input <path>', 'path to input JSON file')
  .requiredOption('-h, --host <host>', 'server host')
  .requiredOption('-p, --port <port>', 'server port');

program.parse(process.argv);
const options = program.opts();

const inputPath = path.resolve(process.cwd(), options.input);

if (!existsSync(inputPath)) {
  console.error('Cannot find input file');
  process.exit(1);
}

const xmlBuilder = new XMLBuilder({
  format: true,
  ignoreAttributes: false
});

async function readJsonLines(filePath) {
  const content = await fs.readFile(filePath, 'utf8');
  // split into lines, filter empty, parse each JSON line
  const lines = content.split(/\r?\n/).filter(l => l.trim().length > 0);
  const items = lines.map(line => {
    try {
      return JSON.parse(line);
    } catch (e) {
      return null;
    }
  }).filter(x => x !== null);
  return items;
}

// Build XML object according to filtered houses
function buildHousesXml(houses) {
  const housesXmlObj = {
    houses: {
      house: houses.map(h => ({
        price: h.price,
        area: h.area,
        furnishingstatus: h.furnishingstatus
      }))
    }
  };
  return xmlBuilder.build(housesXmlObj);
}

const server = http.createServer(async (req, res) => {
  try {
    const parsedUrl = url.parse(req.url, true);
    const qs = parsedUrl.query;

    const items = await readJsonLines(inputPath);

    let filtered = items;

    if (qs.furnished === 'true' || qs.furnished === true) {
      filtered = filtered.filter(it => {
        const fsVal = (it.furnishingstatus || '').toString().toLowerCase();
        return fsVal === 'furnished';
      });
    }

    if (qs.max_price !== undefined) {
      // accept numeric string, remove non-digit characters just in case
      const limit = Number(qs.max_price);
      if (!Number.isNaN(limit)) {
        filtered = filtered.filter(it => {
          const p = Number(it.price);
          return !Number.isNaN(p) && p < limit;
        });
      }
    }

    const xml = buildHousesXml(filtered);

    res.writeHead(200, { 'Content-Type': 'application/xml; charset=utf-8' });
    res.end(xml);
  } catch (err) {
    res.writeHead(500, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Server error: ' + err.message);
  }
});

server.listen(Number(options.port), options.host, () => {
  console.log(`Server running at http://${options.host}:${options.port}/`);
});