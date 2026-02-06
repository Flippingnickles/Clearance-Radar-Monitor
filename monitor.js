name: Clearance Radar Monitor

on:
  workflow_dispatch:
  schedule:
    - cron: "*/30 * * * *"  # runs every 30 minutes

jobs:
  run-monitor:
    runs-on: ubuntu-latest
    timeout-minutes: 5

    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: 18

      - name: Run monitor
        env:
          DISCORD_WEBHOOK_URL: ${{ secrets.DISCORD_WEBHOOK_URL }}
        run: node monitor.js
