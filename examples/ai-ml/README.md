# DocSum

Summarize long PDFs in 8 seconds. Built in 24 hours with FastAPI + GPT.

## Install

```bash
pip install -r requirements.txt
cp .env.example .env  # add your OPENAI_API_KEY
```

## Run

```bash
uvicorn app:app --reload
```

## Demo

1. Visit `http://localhost:8000`.
2. Upload any PDF.
3. Read the 5-bullet summary.

## Tech Stack

- FastAPI
- OpenAI gpt-4o-mini
- pypdf

## Environment

Set `OPENAI_API_KEY` in `.env`. Copy `.env.example` to `.env`.
