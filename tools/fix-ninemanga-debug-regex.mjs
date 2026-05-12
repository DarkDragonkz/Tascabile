#!/usr/bin/env node

import { readFileSync, writeFileSync } from "node:fs";

const filePath = "src/NineManga/main.ts";
let content = readFileSync(filePath, "utf8");

const badSourceLinks = "html.matchAll(/href=[\\\\\\\"']([^\\\\\\\"']*(?:\\/go\\/ennm\\/|type=enninemanga|financemasterpro|sweettoothrecipes)[^\\\\\\\"']*)[\\\\\\\"']/giu)";
const goodSourceLinks = "html.matchAll(/href=[\"']([^\"']*(?:\\/go\\/ennm\\/|type=enninemanga|financemasterpro|sweettoothrecipes)[^\"']*)[\"']/giu)";

const badScripts = "html.matchAll(/<script\\b[^>]*src=[\\\\\\\"']([^\\\\\\\"']+)[\\\\\\\"'][^>]*>/giu)";
const goodScripts = "html.matchAll(/<script\\b[^>]*src=[\"']([^\"']+)[\"'][^>]*>/giu)";

content = content.split(badSourceLinks).join(goodSourceLinks);
content = content.split(badScripts).join(goodScripts);

writeFileSync(filePath, content);
console.log("Fixed NineManga debug regex escaping in " + filePath);
