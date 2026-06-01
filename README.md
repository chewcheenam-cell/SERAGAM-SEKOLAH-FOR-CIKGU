# Batikara Seragam Calculator

Responsive Next.js application for Malaysian school uniform payment summaries. Upload a cikgu name list or simple order file, fill how much each cikgu needs to pay, export the summary, and save searchable project history.

## Quick start

```bash
npm install
npm run dev
```

Copy `.env.example` to `.env.local` and add Supabase credentials when you are ready to use cloud persistence. Without Supabase, the app still works in local browser storage for demo and testing.

## Simple upload columns

Minimum: `Nama`

Recommended: `Nama`, `Jawatan`, `Item`, `Saiz`, `Kuantiti`, `Bayaran`

The app also accepts common alternatives like `Name`, `Cikgu`, `Teacher`, `Jenis Pakaian`, `Quantity`, `Qty`, `Amount`, `Harga`, `Total`, and `Jumlah`.

After upload, edit the table directly to set the amount each cikgu needs to pay.

## Supabase

Run `supabase/schema.sql` in your Supabase SQL editor, then configure the environment variables.

For production admin login, create an admin user in Supabase Auth and add the matching user id to the `admin_users` table.

## Google Sheets integration

Create a Google Sheet, open Apps Script, paste `docs/google-sheets-webhook.gs`, deploy it as a web app, and place the web app URL in `NEXT_PUBLIC_GOOGLE_SHEETS_WEBHOOK_URL`.

## Sample upload

Use `examples/sample-orders.csv` to test the calculator quickly.
