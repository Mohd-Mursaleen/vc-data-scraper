const { scrapeSEBIRecordsToJson } = require("./services/sebiScraper.js");
scrapeSEBIRecordsToJson("sebi_records.json", -1, 1500);
