#!/bin/bash
set -e

echo "Installing Python dependencies with wheel-only option..."
pip install --upgrade pip setuptools wheel
pip install --only-binary :all: -r requirements.txt 2>/dev/null || pip install -r requirements.txt

echo "Build completed successfully!"
