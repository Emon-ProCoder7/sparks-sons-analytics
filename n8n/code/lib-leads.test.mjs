// node n8n/code/lib-leads.test.mjs — checks the n8n helper library before it ships.
import { readFileSync } from "node:fs";
import vm from "node:vm";
import assert from "node:assert/strict";

const ctx = {};
vm.createContext(ctx);
vm.runInContext(readFileSync(new URL("./lib-leads.js", import.meta.url), "utf8"), ctx);
const { extractDecisionMaker, goodEmails, namesMatch, inState, sizeEstimate, rootDomain } = ctx;

const dm = [
  ["Meet John Smith, our Managing Director, who started the yard in 1990. Call 0412 345 678", "Acme", ["John Smith", "Managing Director", "0412 345 678"]],
  ["OWNER: Sarah O'Brien | Sales team", "Acme", ["Sarah O'Brien", "Owner", ""]],
  ["JANE DOE (CA ANZ, REGISTERED TAX AGENT & BUSINESS FOUNDER) leads the firm", "Acme", ["Jane Doe", "Founder", ""]],
  ["Our Team Director Services Premier Quality", "Acme", ["", "", ""]],
  ["Peter McDonald is the owner of Geelong Caravans. Phone 03 5222 1234", "Geelong Caravans", ["Peter McDonald", "Owner", "03 5222 1234"]],
  ["Welcome to Smith Trailers. Contact Us Today", "Smith Trailers", ["", "", ""]],
  ["Directors | Mark Evans - Director | Lisa Evans - Director", "Acme", ["Mark Evans", "Director", ""]],
  ["Get A Free Quote From Our Owner Today", "Acme", ["", "", ""]],
];
let ok = 0;
for (const [text, biz, want] of dm) {
  const got = extractDecisionMaker(text, biz);
  const res = [got.name, got.role, got.mobile];
  const pass = JSON.stringify(res) === JSON.stringify(want);
  ok += pass;
  console.log(pass ? "OK " : "BAD", res, "<-", text.slice(0, 55));
}
assert.equal(ok, dm.length, "decision-maker cases");

assert.deepEqual([...goodEmails('<a href="mailto:sales@acme.com.au">x</a> user@domain.com info@gmail.com x@sentry.io', "https://www.acme.com.au/")], ["sales@acme.com.au", "info@gmail.com"]);
assert.equal(rootDomain("https://shop.acme.com.au/x"), "acme.com.au");
assert.ok(namesMatch("F Sparks & Sons", "F. Sparks & Sons"));
assert.ok(!namesMatch("West Coast Trailers", "F Sparks & Sons"));
assert.ok(inState("80 Cowie St, North Geelong VIC 3215, Australia", "VIC"));
assert.ok(!inState("12 High St, Maidstone ME14 1XX, UK", "VIC"));
assert.equal(sizeEstimate("Prestige Jayco Geelong", 5, ["jayco"], [])[0], "franchise — independently owned office");
console.log("all lib-leads checks passed");
