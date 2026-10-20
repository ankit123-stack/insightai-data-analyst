# InsightAI - AI Data Analyst

InsightAI is a web-based data analysis platform that transforms CSV and Excel datasets into useful insights. It combines data profiling, data quality checks, data cleaning, interactive visualizations, business analytics, downloadable reports, and an AI-powered data assistant.

## Features

- **CSV and Excel Upload and Analysis:** Upload CSV or Excel (`.xlsx`) files and generate an analysis profile.
- **Data Profiling:** Explore row counts, columns, data types, unique values, missing cells, and statistical summaries.
- **Data Quality Checker:** Identify missing values, duplicate rows, outliers, and potential data quality issues.
- **Smart Data Cleaning:** Preview cleaning operations, apply supported changes, reset to the original dataset, and download cleaned data.
- **Interactive Charts:** Explore data with chart controls and visualizations.
- **Business Performance Analytics:** Review sales, profit, profit margin, and product or regional performance when the required data is available.
- **Business Insights:** Review performance insights generated from the available dataset metrics.
- **Advanced Business Insights:** Explore category, regional, product, quantity, and data quality summaries.
- **Decision Support:** Get recommendations based on calculated dataset results.
- **AI Data Assistant:** Ask natural-language questions about your dataset using the configured Groq API integration.
- **Calculated, Backend-Grounded Answers:** Supported questions use backend calculations and verified dataset statistics.
- **Dataset Comparison:** Compare basic metrics from two datasets currently loaded in the backend.
- **Downloadable Reports:** Export reports as JSON, PDF, or Excel workbooks. Excel workbooks include **Summary**, **Business Insights**, **Statistics**, **Data Quality**, and **Raw Data** worksheets.
- **Raw Dataset Preview:** Inspect uploaded data.
- **Statistical Summaries:** Review statistics for numeric columns.

## Tech Stack

| **Area** | **Technologies** |
|---|---|
| Frontend | React, JavaScript, Vite, CSS |
| Backend | Python, FastAPI, Uvicorn |
| Data Analysis | Pandas, NumPy |
| AI Integration | Groq API |
| Testing | pytest |
| Version Control | Git and GitHub |

## Project Structure

```text
ai-data-analyst/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── tests/
│       └── test_cleaning.py
├── frontend/
│   ├── src/
│   │   ├── App.jsx
│   │   ├── cleaning.css
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── index.html
│   ├── package.json
│   ├── package-lock.json
│   └── vite.config.js
├── sample_data/
│   ├── customer_orders.csv
│   ├── customer_orders_comparison.xlsx
│   ├── customer_orders_sample.xlsx
│   └── sales.csv
├── screenshots/
│   └── dashboard.png
├── .gitignore
└── README.md
```

## Prerequisites

- Python 3.11 or a compatible Python version
- Node.js and npm
- A Groq API key for AI-assisted questions

## Installation and Setup

### 1. Clone the Repository

```bash
git clone https://github.com/ankit123-stack/insightai-data-analyst.git
cd insightai-data-analyst
```

### 2. Set Up the Backend

Open a terminal in the project root and run:

```powershell
cd backend
python -m venv venv
.\venv\Scripts\Activate.ps1
pip install -r requirements.txt
```

### 3. Configure Environment Variables

Create a file named `.env` inside the `backend` directory and add:

```env
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-20b
```

Replace the example API key with your own Groq API key. Ensure that `GROQ_MODEL` matches the model configured in your application.

**Security:** Never commit your real API key or `.env` file to GitHub. Ensure your `.gitignore` excludes these files.

### 4. Start the Backend

Run this command from the `backend` directory:

```powershell
uvicorn main:app --reload --port 8000
```

Backend URLs:

- API: [http://127.0.0.1:8000](http://127.0.0.1:8000)
- Interactive API documentation: [http://127.0.0.1:8000/docs](http://127.0.0.1:8000/docs)
- Health check: [http://127.0.0.1:8000/api/health](http://127.0.0.1:8000/api/health)

Keep this terminal running.

### 5. Set Up the Frontend

Open a second terminal in the project root and run:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite in the terminal, usually `http://localhost:5173`.

If Vite selects a different port, use the URL it displays. If the frontend cannot reach the backend, verify the API URL and ensure the backend's CORS configuration allows the frontend's current origin.

## How to Use InsightAI

1. Start the backend and frontend.
2. Open InsightAI in your browser.
3. Upload a CSV or Excel (`.xlsx`) dataset.
4. Review the data profile and quality indicators.
5. Explore charts, statistics, and available business analytics.
6. Ask questions about your dataset using the AI Data Assistant.
7. Preview and apply supported data cleaning operations.
8. Download analysis reports or cleaned data when needed.

Sample CSV and Excel datasets are available in the `sample_data/` directory.

## API Endpoints

| **Method** | **Endpoint** | **Purpose** |
|---|---|---|
| GET | `/` | API status |
| GET | `/api/health` | Health check |
| POST | `/api/upload` | Upload and analyze a CSV or Excel (`.xlsx`) dataset |
| POST | `/api/clean/{dataset_id}/preview` | Preview cleaning changes |
| POST | `/api/clean/{dataset_id}/apply` | Apply cleaning changes |
| POST | `/api/clean/{dataset_id}/reset` | Reset cleaning changes |
| GET | `/api/clean/{dataset_id}/download` | Download cleaned data |
| GET | `/api/chart/{dataset_id}` | Generate chart data |
| GET | `/api/analytics/{dataset_id}` | Calculate business analytics |
| POST | `/api/ask` | Ask a question about a dataset |
| POST | `/api/compare` | Compare two loaded datasets |
| GET | `/api/report/excel/{dataset_id}` | Download a multi-sheet Excel report |

Visit `/docs` while the backend is running to inspect request schemas, parameters, and responses.

JSON and PDF reports are generated by the frontend; they do not currently use dedicated backend report endpoints.

## Important Notes

- Uploaded datasets are held in backend memory. Restarting the backend can clear loaded datasets.
- AI-generated responses can contain inaccuracies. Verify important claims against the underlying data.
- Do not upload confidential business information or personally identifiable data to a public deployment.
- Keep API credentials private and out of source control.
- This project is intended for learning, demonstration, and portfolio purposes.

## Future Improvements

- Expand automated test coverage.
- Improve data validation and error handling.
- Strengthen validation of AI-generated insights.
- Add persistent dataset storage where needed.

## Author

**Ankit Kumar**

- GitHub: [https://github.com/ankit123-stack](https://github.com/ankit123-stack)
- Project Repository: [https://github.com/ankit123-stack/insightai-data-analyst](https://github.com/ankit123-stack/insightai-data-analyst)

## Screenshots

### InsightAI Dashboard

![InsightAI Dashboard](screenshots/dashboard.png)
