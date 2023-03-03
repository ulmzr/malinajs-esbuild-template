#!/bin/sh

rm -rf package-lock.json
mv package.json _package.json
mv github-package.json package.json
git add .
git commit -m "updated"
git push
mv package.json github-package.json
mv _package.json package.json
rm -rf package-lock.json


