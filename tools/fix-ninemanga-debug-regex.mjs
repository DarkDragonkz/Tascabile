#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const filePath = "src/NineManga/main.ts";
let content = readFileSync(filePath, "utf8");

content = content.replace(
  /\/href=\[\\\\\\\"'\]\(\[\^\\\\\\\"'\]\*\(\?:\\\/go\\\/ennm\\\/\|type=enninemanga\|financemasterpro\|sweettoothrecipes\)\[\^\\\\\\\"'\]\*\)\[\\\\\\\"'\]\/giu/g,
  "/href=[\"']([^\"']*(?:\\/go\\/ennm\\/|type=enninemanga|financemasterpro|sweettoothrecipes)[^\"']*)[\"']/giu",
);

content = content.replace(
  /\/<script\\\\b\[\^>\]\*src=\[\\\\\\\"'\]\(\[\^\\\\\\\"'\]\+\)\[\\\\\\\"'\]\[\^>\]\*>\/giu/g,
  "/<script\\b[^>]*src=[\"']([^\"']+)[\"'][^>]*>/giu",
);

writeFileSync(filePath, content);
console.log("Fixed NineManga debug regex escaping in " + filePath);
