# VC Scraper Pipeline - Usage Guide

## Quick Start

### 1. Setup Environment

```bash
# Install dependencies
npm install

# Create .env file from template
cp .env.example .env

# Edit .env and add your Apify token
# APIFY_API_TOKEN=your_actual_token_here
```

### 2. Prepare Input

Edit `inputs.json` with your SEBI records:

```json
[
  {
    "Name": "Ascent Capital",
    "Registration No.": "IN/AIF1/25-26/1857",
    "E-mail": "manjunath@ascentcapital.in",
    "Address": "...",
    "Contact Person": "Manjunath Kallapur",
    "Validity": "Jul 23, 2025 - Perpetual"
  }
]
```

### 3. Run Pipeline

```bash
node main.js
```

## Output Files

### 1. `results.csv` - Main Output
CSV file with all firms and their 16 data points:

**Columns:**
- SEBI metadata (firm name, registration, contact, email, address, validity)
- Processing status (success/failed, error message)
- Statistics (URLs scraped, pages analyzed, profiles scraped, duration)
- **16 Synthesized Data Points:**
  1. `firm_name` - Official firm name
  2. `fund_names` - All fund names (pipe-separated)
  3. `fund_sizes` - Fund sizes with years
  4. `gps` - General Partners list
  5. `gp_backgrounds` - GP career backgrounds
  6. `team_size` - Total team size
  7. `recent_funding_activity` - Recent deals (2020-2025)
  8. `fund_start_date` - First fund launch date
  9. `firm_start_date` - Firm founding date
  10. `portfolio_companies` - All portfolio companies
  11. `past_performance` - Exits, IPOs, returns
  12. `industry_focus` - Primary sectors
  13. `deal_velocity` - Deals per year
  14. `avg_cheque_size` - Investment range
  15. `cheque_size_pct_round` - Typical % of round
  16. `primary_coinvestors` - Co-investment partners

### 2. `data/reports/` - Individual JSON Reports
Detailed JSON files for each firm:
```
data/reports/
├── ascent-capital_report.json
├── 021-capital-trust_report.json
└── ...
```

### 3. `data/firms/` - Detailed Firm Data
Complete data for each firm:
```
data/firms/ascent-capital/
├── page_analyses/           # PageAnalyzer JSON outputs
│   ├── page_001_analysis.json
│   ├── page_002_analysis.json
│   └── ...
├── pages/                   # Scraped HTML and cleaned text
│   ├── page_001_raw.html
│   ├── page_001_cleaned.json
│   └── ...
├── extracted_links/         # Links found on each page
├── linkedin_queue.json      # All LinkedIn URLs discovered
├── linkedin_prioritized.json # LinkedIn URLs with importance scores
├── linkedin_scraped_profiles.json # Scraped LinkedIn profiles
└── final_report.json        # Final synthesized report
```

## Pipeline Phases

For each firm, the pipeline executes:

1. **Discovery** - Find official website, LinkedIn, news URLs
2. **Classification** - Separate regular URLs from LinkedIn URLs
3. **Scraping & Analysis** - Scrape pages, extract structured facts
4. **Link Extraction** - Find additional LinkedIn URLs from pages
5. **LinkedIn Prioritization** - Score LinkedIn URLs (1-100)
6. **LinkedIn Scraping** - Scrape high-value profiles (score >= 60)
7. **Synthesis** - Combine all data into 16-point report

## Configuration

### Rate Limiting
Pipeline includes automatic delays:
- 1 second between page scrapes
- 3 seconds between firms

### Error Handling
- Pipeline continues even if individual firms fail
- Errors logged in CSV `processing_error` column
- Failed firms still included in output with error details

### Cost Optimization
- Only LinkedIn profiles with `importance >= 60` are scraped
- Saves Apify credits by filtering low-value profiles
- PageAnalyzer filters irrelevant pages automatically

## Example Output

### CSV Row (simplified)
```csv
sebi_firm_name,sebi_registration_no,processing_status,firm_name,fund_sizes,gps,portfolio_companies
Ascent Capital,IN/AIF1/25-26/1857,SUCCESS,Ascent Capital,"Fund I: $150M (2012) | Fund II: $300M (2016) | Fund III: $350M (2020)","Manjunath Kallapur - Managing Partner | Shubha Balasubramanian - Partner","Daya Hospital | EnKash | BigBasket | FreshToHome"
```

### JSON Report (structure)
```json
{
  "sebi_record": { /* Original SEBI data */ },
  "synthesized_data": {
    "firm_name": "Ascent Capital",
    "fund_names": ["Fund I", "Fund II", "Fund III"],
    "fund_sizes": ["Fund I: $150M (2012)", ...],
    "gps": ["Manjunath Kallapur - Managing Partner", ...],
    ...
  },
  "stats": {
    "regularUrls": 10,
    "linkedInUrls": 8,
    "analyzedPages": 7,
    "linkedInProfiles": 5,
    "duration": "8.5"
  },
  "generated_at": "2025-11-30T12:45:00Z"
}
```

## Monitoring Progress

Watch console output for real-time progress:

```
🚀 STARTING VC SCRAPER PIPELINE - BATCH PROCESSING
================================================================================
📥 Loaded 7 firm records from inputs.json
📊 Processing 7 firms...

[1/7] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
🏢 Processing: Ascent Capital

  ⭐ PHASE 1: Discovery
  ✅ Discovered 12 URLs

  📊 PHASE 2: URL Classification
  ✅ Regular: 8, LinkedIn: 4

  🌐 PHASE 3: Scraping & Analyzing
  ✅ Analyzed 7 relevant pages

  ...

  ✅ PIPELINE COMPLETE
  📊 Firm: Ascent Capital
  ⏱️  Duration: 8.5 minutes

  ⏱️  Waiting 3 seconds before next firm...

[2/7] ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
...
```

## Troubleshooting

### No LinkedIn profiles scraped
- Check `APIFY_API_TOKEN` in `.env`
- Verify Apify account has credits
- Check console for error messages

### Low data quality
- Ensure input records have accurate contact person names
- Verify email addresses are correct
- Check that firm names match official websites

### Pipeline hanging
- Check internet connection
- Verify Gemini API is accessible
- Look for rate limiting errors in console

## Best Practices

1. **Start Small**: Test with 1-2 firms first
2. **Monitor Costs**: Apify charges per profile scraped
3. **Review Output**: Check CSV and JSON reports for quality
4. **Backup Data**: The `data/` directory contains all raw data
5. **Iterate**: Use failed firms' error messages to improve input data

## Support

For issues or questions:
1. Check console logs for detailed error messages
2. Review individual firm directories in `data/firms/`
3. Examine `linkedin_prioritized.json` for scoring insights
4. Check `page_analyses/` for fact extraction quality
