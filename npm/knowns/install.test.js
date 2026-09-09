"use strict";

const { test, expect } = require("bun:test");
const fs = require("node:fs");
const path = require("node:path");

const { getPlatformPackage } = require("./install.js");

function readPackageJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(__dirname, relativePath), "utf8"));
}

test("maps Windows x64 to the published package name", () => {
  expect(getPlatformPackage("win32", "x64")).toEqual({
    name: "@knowme/win-x64",
    asset: "knowme-win-x64",
    ext: ".exe",
    packageOs: "win32",
    packageCpu: "x64",
  });
});

test("maps macOS Intel to the darwin-x64 package and release asset", () => {
  expect(getPlatformPackage("darwin", "x64")).toEqual({
    name: "@knowme/darwin-x64",
    asset: "knowme-darwin-x64",
    ext: "",
    packageOs: "darwin",
    packageCpu: "x64",
  });
});

test("all platform manifests use the knowme package scope", () => {
  const packages = [
    ["darwin-arm64", "darwin", "arm64"],
    ["darwin-x64", "darwin", "x64"],
    ["linux-arm64", "linux", "arm64"],
    ["linux-x64", "linux", "x64"],
    ["win-arm64", "win32", "arm64"],
    ["win-x64", "win32", "x64"],
  ];

  for (const [platform, packageOs, packageCpu] of packages) {
    const pkg = readPackageJson(`../knowme-${platform}/package.json`);

    expect(pkg.name).toBe(`@knowme/${platform}`);
    expect(pkg.os).toEqual([packageOs]);
    expect(pkg.cpu).toEqual([packageCpu]);
    expect(pkg.main).toBe("knowme");
  }
});

test("macOS Intel package contains only the CLI binary", () => {
  const pkg = readPackageJson("../knowme-darwin-x64/package.json");

  expect(pkg.os).toEqual(["darwin"]);
  expect(pkg.cpu).toEqual(["x64"]);
  expect(pkg.files).toEqual(["knowme"]);
});

test("Windows platform packages use npm's win32 os identifier", () => {
  const x64Pkg = readPackageJson("../knowme-win-x64/package.json");
  const arm64Pkg = readPackageJson("../knowme-win-arm64/package.json");

  expect(x64Pkg.os).toEqual(["win32"]);
  expect(arm64Pkg.os).toEqual(["win32"]);
  expect(x64Pkg.cpu).toEqual(["x64"]);
  expect(arm64Pkg.cpu).toEqual(["arm64"]);
});
