#!/bin/bash
# Script to create a Lambda Layer for lxml
# This layer includes lxml and its dependencies for Python 3.11 on Amazon Linux 2

set -e

LAYER_NAME="lxml-layer"
LAYER_DIR="layer"
PYTHON_VERSION="3.11"

echo "Creating Lambda Layer for lxml..."

# Create layer directory structure
mkdir -p "${LAYER_DIR}/python/lib/python${PYTHON_VERSION}/site-packages"

# Use Docker to build lxml in Amazon Linux 2 environment
echo "Building lxml in Docker (Amazon Linux 2)..."
docker run --rm \
  -v "$(pwd)/${LAYER_DIR}:/output" \
  -v "$(pwd)/requirements.txt:/requirements.txt" \
  public.ecr.aws/lambda/python:${PYTHON_VERSION} \
  bash -c "
    yum install -y libxml2-devel libxslt-devel gcc python3-devel && \
    pip install --upgrade pip && \
    pip install lxml>=4.9.0 -t /output/python/lib/python${PYTHON_VERSION}/site-packages
  "

echo "Layer created in ${LAYER_DIR}/"
echo ""
echo "To create the Lambda Layer, run:"
echo "  cd ${LAYER_DIR} && zip -r ../${LAYER_NAME}.zip ."
echo ""
echo "Then create the layer in AWS:"
echo "  aws lambda publish-layer-version \\"
echo "    --layer-name ${LAYER_NAME} \\"
echo "    --zip-file fileb://${LAYER_NAME}.zip \\"
echo "    --compatible-runtimes python${PYTHON_VERSION}"

