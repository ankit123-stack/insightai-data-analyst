
# InsightAI — AI Data Analyst

InsightAI is a web-based data analysis application that helps users explore CSV datasets, evaluate data quality, visualize trends, and ask questions about their data.

## Features

- **CSV Upload:** Upload CSV files for analysis.
- **Data Profiling:** View dataset dimensions, column types, unique values, and missing cells.
- **Data Quality Checker:** Inspect missing values, duplicate rows, outliers, and other data quality indicators.
- **Data Cleaning:** Preview cleaning changes, apply supported cleaning options, reset to the original dataset, and download cleaned CSV files.
- **Business Analytics:** Explore sales, profit, profit margin, and product or regional performance where the uploaded data supports these metrics.
- **Interactive Visualizations:** View charts and statistical summaries generated from the dataset.
- **AI Data Assistant:** Ask natural-language questions about your data using the configured AI integration, with calculated answers available for supported questions.
- **Downloadable Reports:** Export analysis results as JSON and PDF.
- **Data Preview:** Inspect rows and column profiles before making decisions.

## Tech Stack

### Frontend
- React
- Vite
- JavaScript
- CSS

### Backend
- Python
- FastAPI
- Pandas
- NumPy
- Uvicorn
- Groq API integration for AI-assisted questions

## Project Structure

```text
ai-data-analyst/
├── backend/
│   ├── main.py
│   ├── requirements.txt
│   └── .env                 # Local only; do not commit
├── frontend/
│   ├── package.json
│   └── src/
├── sample_data/
├── .gitignore
└── README.md
```

The exact files and folders may differ slightly depending on the current project version.

## Prerequisites

- Python 3.11 or a compatible version supported by the installed dependencies
- Node.js and npm
- A Groq API key for AI-assisted questions

## Run the Backend

Open a terminal in the project root and run:

```powershell
cd backend
python -m venv venv
```

Activate the virtual environment on Windows PowerShell:

```powershell
.\venv\Scripts\Activate.ps1
```

Install the backend dependencies:

```powershell
pip install -r requirements.txt
```

Create or update `backend/.env` with your own API key and the model setting expected by your current backend configuration:

```dotenv
GROQ_API_KEY=your_groq_api_key_here
GROQ_MODEL=openai/gpt-oss-20b
```

Use your actual configured model if it differs. Never publish your real API key.

Start the backend:

```powershell
uvicorn main:app --reload --port 8000
```

Backend URL: http://127.0.0.1:8000

Interactive API documentation: http://127.0.0.1:8000/docs

Health check: http://127.0.0.1:8000/api/health

## Run the Frontend

Open a **second terminal** in the project root:

```powershell
cd frontend
npm install
npm run dev
```

Open the local URL printed by Vite in the terminal.

If the frontend cannot connect to the backend, check the API base URL in the existing frontend configuration and confirm that the backend's CORS settings allow the frontend's current local origin.

## Typical Workflow

1. Start the backend and frontend.
2. Upload a CSV dataset.
3. Review data quality and statistical summaries.
4. Explore charts and business insights.
5. Ask questions using the AI Data Assistant.
6. Preview and apply cleaning options when needed.
7. Download reports or the cleaned dataset.

## API Endpoints

The backend currently includes endpoints for:

- `GET /` — API status
- `GET /api/health` — Health check
- `POST /api/upload` — Upload and analyze a CSV
- `POST /api/clean/{dataset_id}/preview` — Preview cleaning
- `POST /api/clean/{dataset_id}/apply` — Apply cleaning
- `POST /api/clean/{dataset_id}/reset` — Reset cleaning
- `GET /api/clean/{dataset_id}/download` — Download cleaned data
- `GET /api/chart/{dataset_id}` — Generate chart data
- `GET /api/analytics/{dataset_id}` — Calculate analytics
- `POST /api/ask` — Ask a question about a dataset

See `/docs` for the current request schemas and responses.

## Important Notes

- Uploaded datasets are currently held in backend memory. Restarting the backend may clear them.
- Keep API keys in environment variables and never commit `.env` files.
- AI-generated recommendations should be checked against the underlying data before being used for business decisions.
- Do not upload confidential, private, or personally identifiable data to a public repository.
- This project is provided for learning and demonstration purposes.

## Future Improvements

- Deploy the frontend and backend.
- Add automated tests and stronger validation of AI-generated claims.
- Improve documentation and error handling.
- Add persistent storage if required.

## Author

Ankit Kumar
