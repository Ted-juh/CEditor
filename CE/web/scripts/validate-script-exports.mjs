import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { emitScript } from '../src/CE_Application/scripting/scriptEmitters.js';
import { createMacroRoutingScript } from '../src/CE_Application/scripting/scriptSamples.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const webRoot = path.resolve(here, '..');
const repoRoot = path.resolve(webRoot, '..', '..');
const workspaceRoot = path.resolve(os.tmpdir(), 'ceditor-script-export-validation');

function quote(value) {
  return `"${String(value).replace(/"/g, '""')}"`;
}

function run(command, args = [], options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd ?? webRoot,
    encoding: 'utf8',
    shell: options.shell ?? false,
    windowsHide: true,
  });
  return {
    status: result.status ?? 1,
    stdout: result.stdout ?? '',
    stderr: result.stderr ?? '',
    error: result.error?.message ?? '',
  };
}

function commandCandidates(name) {
  if (process.platform !== 'win32') return [name];
  const extensions = path.extname(name) ? [''] : ['.exe', '.cmd', '.bat', ''];
  return extensions.map((extension) => `${name}${extension}`);
}

function resolveCommand(names) {
  for (const name of names) {
    if (name.includes('/') || name.includes('\\')) {
      const fullPath = path.resolve(webRoot, name);
      if (existsSync(fullPath)) return fullPath;
      continue;
    }
    const lookup = process.platform === 'win32'
      ? run('where.exe', [name])
      : run('which', [name]);
    if (lookup.status === 0) {
      const first = lookup.stdout.split(/\r?\n/).find(Boolean);
      if (first) return first.trim();
    }
    for (const candidate of commandCandidates(name)) {
      const lookupCandidate = process.platform === 'win32'
        ? run('where.exe', [candidate])
        : run('which', [candidate]);
      if (lookupCandidate.status === 0) {
        const first = lookupCandidate.stdout.split(/\r?\n/).find(Boolean);
        if (first) return first.trim();
      }
    }
  }
  return '';
}

function runExecutable(executable, args, cwd) {
  const isCmd = process.platform === 'win32' && /\.(cmd|bat)$/i.test(executable);
  if (isCmd) {
    return run('cmd.exe', ['/d', '/s', '/c', [quote(executable), ...args.map(quote)].join(' ')], { cwd });
  }
  return run(executable, args, { cwd });
}

function combineOutput(result) {
  return [result.error, result.stdout, result.stderr].filter(Boolean).join('\n').trim();
}

function result(target, status, detail, extra = {}) {
  return { target, status, detail, ...extra };
}

async function resetWorkspace() {
  if (!workspaceRoot.endsWith('ceditor-script-export-validation')) {
    throw new Error(`Refusing to clear unexpected validation workspace: ${workspaceRoot}`);
  }
  await rm(workspaceRoot, { recursive: true, force: true });
  await mkdir(workspaceRoot, { recursive: true });
}

async function writeTargetFile(target, filename, contents) {
  const directory = path.join(workspaceRoot, target);
  await mkdir(directory, { recursive: true });
  const filePath = path.join(directory, filename);
  await writeFile(filePath, contents, 'utf8');
  return { directory, filePath };
}

function generated(target) {
  return emitScript(createMacroRoutingScript(), target);
}

function javascriptHarness() {
  return `
const patches = [];
const midi = [];
function scale(value, fromMin, fromMax, toMin, toMax) {
  return toMin + ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin);
}
function round(value) { return Math.round(value); }
function setValue(target, value) { patches.push({ target, value }); }
function sendCC(message) { midi.push(message); }
${generated('javascript')}
onControlChanged('macroControl', { value: 0.5, phase: 'commit' });
if (patches.length !== 2) throw new Error('expected two value patches');
if (midi.length !== 1 || midi[0].value !== 64) throw new Error('expected one CC value');
`.trimStart();
}

function typescriptHarness() {
  return `
const patches: Array<{ target: string; value: number }> = [];
const midi: Array<{ channel: number; cc: number; value: number }> = [];
function scale(value: number, fromMin: number, fromMax: number, toMin: number, toMax: number): number {
  return toMin + ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin);
}
function round(value: number): number { return Math.round(value); }
function setValue(target: string, value: number): void { patches.push({ target, value }); }
function sendCC(message: { channel: number; cc: number; value: number }): void { midi.push(message); }
${generated('typescript')}
onControlChanged('macroControl', { value: 0.5, phase: 'commit' });
if (patches.length !== 2) throw new Error('expected two value patches');
if (midi.length !== 1 || midi[0].value !== 64) throw new Error('expected one CC value');
`.trimStart();
}

function luaHarness() {
  return `
local patches = {}
local midi = {}
function scale(value, fromMin, fromMax, toMin, toMax)
  return toMin + ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin)
end
function round(value) return math.floor(value + 0.5) end
function setValue(target, value) table.insert(patches, { target = target, value = value }) end
function sendCC(channel, cc, value) table.insert(midi, { channel = channel, cc = cc, value = value }) end
${generated('lua')}
onControlChanged({ value = 0.5, phase = 'commit' })
assert(#patches == 2, 'expected two value patches')
assert(#midi == 1 and midi[1].value == 64, 'expected one CC value')
`.trimStart();
}

function pythonHarness() {
  return `
patches = []
midi = []
class Event:
    value = 0.5
    phase = "commit"
def scale(value, from_min, from_max, to_min, to_max):
    return to_min + ((value - from_min) / (from_max - from_min)) * (to_max - to_min)
def set_value(target, value):
    patches.append({"target": target, "value": value})
def send_cc(channel, cc, value):
    midi.append({"channel": channel, "cc": cc, "value": value})
${generated('python')}
onControlChanged(Event())
assert len(patches) == 2, 'expected two value patches'
assert len(midi) == 1 and midi[0]["value"] == 64, 'expected one CC value'
`.trimStart();
}

function cppHarness() {
  return `
#include <cmath>
#include <initializer_list>
#include <stdexcept>
#include <string>
#include <utility>
#include <vector>

namespace ce {
double scale(double value, double fromMin, double fromMax, double toMin, double toMax) {
  return toMin + ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin);
}
double clamp(double value, double min, double max) { return value < min ? min : value > max ? max : value; }
double curve(double value, double from, double to, const char*) { return scale(value, 0.0, 1.0, from, to); }
}

struct CeEvent { double value = 0.0; };

struct MidiOut {
  int ccCount = 0;
  long lastCcValue = -1;
  void sendCC(int, int, long value) { ++ccCount; lastCcValue = value; }
  void sendNRPN(int, int, int, long) {}
  void sendSysex(std::initializer_list<int>) {}
  std::vector<int> buildSysex(std::initializer_list<int> bytes) { return std::vector<int>(bytes); }
  int checksum(const char*, std::initializer_list<int>) { return 0; }
  int to14Bit(double value) { return static_cast<int>(std::lround(value)); }
};

struct CeContext {
  std::vector<std::pair<std::string, double>> patches;
  MidiOut midiOut;
  double getValue(const char*) const { return 0.0; }
  void setValue(const char* target, double value) { patches.emplace_back(target, value); }
  void setVisible(const char*, bool) {}
  void showGroup(const char*) {}
  void hideGroup(const char*) {}
  void setPanelState(const char*) {}
  void setPartColor(const char*, const char*) {}
  void setAnimation(const char*, const char*, bool) {}
  void startTimer(const char*, int) {}
  void stopTimer(const char*) {}
  void emitEvent(const char*, const char*, double) {}
  void trace(const char*, double) {}
  MidiOut& midi() { return midiOut; }
};

${generated('cpp')}

int main() {
  CeContext ctx;
  onControlChanged(ctx, CeEvent{0.5});
  if (ctx.patches.size() != 2) throw std::runtime_error("expected two value patches");
  if (ctx.midi().ccCount != 1 || ctx.midi().lastCcValue != 64) throw std::runtime_error("expected one CC value");
  return 0;
}
`.trimStart();
}

function csharpHarness() {
  return `
using System;
using System.Collections.Generic;

public sealed class CeEvent { public double Value { get; set; } }

public sealed class ScriptHarness {
  private readonly List<(string Target, double Value)> patches = new();
  private int ccCount;
  private int lastCcValue;

  private static double Scale(double value, double fromMin, double fromMax, double toMin, double toMax) =>
    toMin + ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin);
  private static double Clamp(double value, double min, double max) => Math.Min(max, Math.Max(min, value));
  private static double Curve(double value, double from, double to, string shape) => Scale(value, 0, 1, from, to);
  private double GetValue(string target) => 0;
  private void SetValue(string target, double value) => patches.Add((target, value));
  private void SetVisible(string target, bool visible) {}
  private void ShowGroup(string group) {}
  private void HideGroup(string group) {}
  private void SetPanelState(string state) {}
  private void SetPartColor(string part, string color) {}
  private void SetAnimation(string target, string animation, bool enabled) {}
  private void StartTimer(string id, int ms) {}
  private void StopTimer(string id) {}
  private void EmitEvent(string eventName, string target, double value) {}
  private void SendCC(int channel, int cc, int value) { ccCount++; lastCcValue = value; }
  private void SendNRPN(int channel, int parameterMsb, int parameterLsb, int value) {}
  private void SendSysex(byte[] bytes) {}
  private byte[] BuildSysex(byte[] bytes) => bytes;
  private int Checksum(string type, byte[] bytes) => 0;
  private int To14Bit(double value) => (int)Math.Round(value);
  private void Trace(string message, double value) {}

${generated('csharp').split('\n').map((line) => `  ${line}`).join('\n')}

  public static void Main() {
    var harness = new ScriptHarness();
    harness.OnControlChanged(new CeEvent { Value = 0.5 });
    if (harness.patches.Count != 2) throw new Exception("expected two value patches");
    if (harness.ccCount != 1 || harness.lastCcValue != 64) throw new Exception("expected one CC value");
  }
}
`.trimStart();
}

function goMain() {
  return `
package main

import (
  "math"
  "ceditor-validator/ce"
  "ceditor-validator/midi"
)

${generated('go')}

func main() {
  OnControlChanged(ce.Event{Value: 0.5})
  if len(ce.Patches) != 2 {
    panic("expected two value patches")
  }
  if midi.CCCount != 1 || midi.LastCCValue != 64 {
    panic("expected one CC value")
  }
}
`.trimStart();
}

const goCePackage = `
package ce

type Event struct { Value float64 }
type Patch struct { Target string; Value float64 }
var Patches []Patch
func SetValue(target string, value float64) { Patches = append(Patches, Patch{target, value}) }
func GetValue(target string) float64 { return 0 }
func SetVisible(target string, visible bool) {}
func ShowGroup(group string) {}
func HideGroup(group string) {}
func SetPanelState(state string) {}
func SetPartColor(part string, color string) {}
func SetAnimation(target string, animation string, enabled bool) {}
func StartTimer(id string, ms int) {}
func StopTimer(id string) {}
func EmitEvent(event string, target string, value float64) {}
func Trace(message string, value float64) {}
func Scale(value float64, fromMin float64, fromMax float64, toMin float64, toMax float64) float64 {
  return toMin + ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin)
}
func Clamp(value float64, min float64, max float64) float64 {
  if value < min { return min }
  if value > max { return max }
  return value
}
func Curve(value float64, from float64, to float64, shape string) float64 { return Scale(value, 0, 1, from, to) }
`.trimStart();

const goMidiPackage = `
package midi

var CCCount int
var LastCCValue int
func SendCC(channel int, cc int, value int) { CCCount++; LastCCValue = value }
func SendNRPN(channel int, parameterMsb int, parameterLsb int, value int) {}
func SendSysex(bytes []byte) {}
func BuildSysex(bytes []byte) []byte { return bytes }
func Checksum(kind string, bytes []byte) int { return 0 }
func To14Bit(value float64) int { return int(value) }
`.trimStart();

function rustHarness() {
  return `
mod ce {
    pub struct Event { pub value: f64 }
    pub struct Patch { pub target: String, pub value: f64 }
    pub struct Midi { pub cc_count: usize, pub last_cc_value: i32 }
    pub struct Context { pub patches: Vec<Patch>, pub midi_out: Midi }
    impl Context {
        pub fn new() -> Self { Self { patches: Vec::new(), midi_out: Midi { cc_count: 0, last_cc_value: -1 } } }
        pub fn value(&self, _target: &str) -> f64 { 0.0 }
        pub fn set_value(&mut self, target: &str, value: f64) { self.patches.push(Patch { target: target.to_string(), value }); }
        pub fn set_visible(&mut self, _target: &str, _visible: bool) {}
        pub fn show_group(&mut self, _group: &str) {}
        pub fn hide_group(&mut self, _group: &str) {}
        pub fn set_panel_state(&mut self, _state: &str) {}
        pub fn set_part_color(&mut self, _part: &str, _color: &str) {}
        pub fn set_animation(&mut self, _target: &str, _animation: &str, _enabled: bool) {}
        pub fn start_timer(&mut self, _id: &str, _ms: i32) {}
        pub fn stop_timer(&mut self, _id: &str) {}
        pub fn emit_event(&mut self, _event: &str, _target: &str, _value: f64) {}
        pub fn trace(&mut self, _message: &str, _value: f64) {}
        pub fn midi(&mut self) -> &mut Midi { &mut self.midi_out }
    }
    impl Midi {
        pub fn send_cc(&mut self, _channel: i32, _cc: i32, value: i32) { self.cc_count += 1; self.last_cc_value = value; }
        pub fn send_nrpn(&mut self, _channel: i32, _msb: i32, _lsb: i32, _value: i32) {}
        pub fn send_sysex(&mut self, _bytes: &[u8]) {}
        pub fn build_sysex(&mut self, bytes: &[u8]) -> Vec<u8> { bytes.to_vec() }
        pub fn checksum(&mut self, _kind: &str, _bytes: &[u8]) -> i32 { 0 }
        pub fn to_14_bit(&mut self, value: f64) -> i32 { value.round() as i32 }
    }
    pub fn scale(value: f64, from_min: f64, from_max: f64, to_min: f64, to_max: f64) -> f64 {
        to_min + ((value - from_min) / (from_max - from_min)) * (to_max - to_min)
    }
    pub fn clamp(value: f64, min: f64, max: f64) -> f64 { value.max(min).min(max) }
    pub fn curve(value: f64, from: f64, to: f64, _shape: &str) -> f64 { scale(value, 0.0, 1.0, from, to) }
}

${generated('rust')}

fn main() {
    let mut ctx = ce::Context::new();
    on_control_changed(&mut ctx, ce::Event { value: 0.5 });
    assert_eq!(ctx.patches.len(), 2, "expected two value patches");
    assert_eq!(ctx.midi_out.cc_count, 1, "expected one CC message");
    assert_eq!(ctx.midi_out.last_cc_value, 64, "expected one CC value");
}
`.trimStart();
}

function kotlinHarness() {
  return `
import kotlin.math.round

data class CeEvent(val value: Double)
data class Patch(val target: String, val value: Double)
val patches = mutableListOf<Patch>()
var ccCount = 0
var lastCcValue = -1
fun scale(value: Double, fromMin: Double, fromMax: Double, toMin: Double, toMax: Double): Double =
  toMin + ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin)
fun clamp(value: Double, min: Double, max: Double): Double = value.coerceIn(min, max)
fun curve(value: Double, from: Double, to: Double, shape: String): Double = scale(value, 0.0, 1.0, from, to)
fun getValue(target: String): Double = 0.0
fun setValue(target: String, value: Double) { patches.add(Patch(target, value)) }
fun setVisible(target: String, visible: Boolean) {}
fun showGroup(group: String) {}
fun hideGroup(group: String) {}
fun setPanelState(state: String) {}
fun setPartColor(part: String, color: String) {}
fun setAnimation(target: String, animation: String, enabled: Boolean) {}
fun startTimer(id: String, ms: Int) {}
fun stopTimer(id: String) {}
fun emitEvent(event: String, target: String, value: Double) {}
fun sendCC(channel: Int, cc: Int, value: Int) { ccCount++; lastCcValue = value }
fun sendNRPN(channel: Int, parameterMsb: Int, parameterLsb: Int, value: Int) {}
fun sendSysex(bytes: ByteArray) {}
fun buildSysex(bytes: ByteArray): ByteArray = bytes
fun checksum(type: String, bytes: ByteArray): Int = 0
fun to14Bit(value: Double): Int = round(value).toInt()
fun trace(message: String, value: Double) {}

${generated('kotlin')}

fun main() {
  onControlChanged(CeEvent(0.5))
  check(patches.size == 2) { "expected two value patches" }
  check(ccCount == 1 && lastCcValue == 64) { "expected one CC value" }
}
`.trimStart();
}

function swiftHarness() {
  return `
import Foundation

struct CeEvent { let value: Double }
struct Patch { let target: String; let value: Double }
var patches: [Patch] = []
var ccCount = 0
var lastCcValue = -1
func scale(_ value: Double, _ fromMin: Double, _ fromMax: Double, _ toMin: Double, _ toMax: Double) -> Double {
  toMin + ((value - fromMin) / (fromMax - fromMin)) * (toMax - toMin)
}
func clamp(_ value: Double, _ min: Double, _ max: Double) -> Double { Swift.min(max, Swift.max(min, value)) }
func curve(_ value: Double, _ from: Double, _ to: Double, _ shape: String) -> Double { scale(value, 0.0, 1.0, from, to) }
func getValue(_ target: String) -> Double { 0.0 }
func setValue(_ target: String, _ value: Double) { patches.append(Patch(target: target, value: value)) }
func setVisible(_ target: String, _ visible: Bool) {}
func showGroup(_ group: String) {}
func hideGroup(_ group: String) {}
func setPanelState(_ state: String) {}
func setPartColor(_ part: String, _ color: String) {}
func setAnimation(_ target: String, _ animation: String, _ enabled: Bool) {}
func startTimer(_ id: String, _ ms: Int) {}
func stopTimer(_ id: String) {}
func emitEvent(_ event: String, _ target: String, _ value: Double) {}
func sendCC(_ channel: Int, _ cc: Int, _ value: Int) { ccCount += 1; lastCcValue = value }
func sendNRPN(_ channel: Int, _ parameterMsb: Int, _ parameterLsb: Int, _ value: Int) {}
func sendSysex(_ bytes: [UInt8]) {}
func buildSysex(_ bytes: [UInt8]) -> [UInt8] { bytes }
func checksum(_ type: String, _ bytes: [UInt8]) -> Int { 0 }
func to14Bit(_ value: Double) -> Int { Int(round(value)) }
func trace(_ message: String, _ value: Double) {}

${generated('swift')}

onControlChanged(CeEvent(value: 0.5))
precondition(patches.count == 2, "expected two value patches")
precondition(ccCount == 1 && lastCcValue == 64, "expected one CC value")
`.trimStart();
}

function validateMarkup(target, code) {
  if (target === 'html') {
    if (!/^<section data-ce-script="[^"]+">[\s\S]*<\/section>$/.test(code.trim())) {
      return result(target, 'fail', 'HTML projection is not wrapped in a script metadata section.');
    }
    return result(target, 'pass', 'Structural HTML projection check passed.');
  }
  if (target === 'css') {
    const opens = (code.match(/{/g) ?? []).length;
    const closes = (code.match(/}/g) ?? []).length;
    if (opens !== closes || !/--script-event:\s*"[^"]+";/.test(code) || !/--script-target:\s*"[^"]+";/.test(code)) {
      return result(target, 'fail', 'CSS projection has unbalanced braces or missing script metadata variables.');
    }
    return result(target, 'pass', 'Structural CSS projection check passed.');
  }
  return result(target, 'fail', `No markup validator registered for ${target}.`);
}

async function validateJavascript() {
  const node = resolveCommand(['node']);
  if (!node) return result('javascript', 'skip', 'node not found.');
  const { directory, filePath } = await writeTargetFile('javascript', 'macroRouting.js', javascriptHarness());
  const check = runExecutable(node, ['--check', filePath], directory);
  if (check.status !== 0) return result('javascript', 'fail', combineOutput(check), { tool: node });
  const exec = runExecutable(node, [filePath], directory);
  return exec.status === 0
    ? result('javascript', 'pass', 'node --check and runtime harness passed.', { tool: node })
    : result('javascript', 'fail', combineOutput(exec), { tool: node });
}

async function validateTypescript() {
  const node = resolveCommand(['node']);
  const localTsc = path.join(webRoot, 'node_modules', 'typescript', 'bin', 'tsc');
  const globalTsc = resolveCommand(['tsc']);
  const hasLocalTsc = node && existsSync(localTsc);
  if (!hasLocalTsc && !globalTsc) return result('typescript', 'skip', 'TypeScript compiler not found. Install the local dev dependency or put tsc on PATH.');
  const { directory, filePath } = await writeTargetFile('typescript', 'macroRouting.ts', typescriptHarness());
  const args = ['--noEmit', '--strict', '--target', 'ES2022', '--lib', 'ES2022', filePath];
  const exec = hasLocalTsc
    ? runExecutable(node, [localTsc, ...args], directory)
    : runExecutable(globalTsc, args, directory);
  const tool = hasLocalTsc ? `${node} ${localTsc}` : globalTsc;
  return exec.status === 0
    ? result('typescript', 'pass', 'tsc --strict --noEmit passed.', { tool })
    : result('typescript', 'fail', combineOutput(exec), { tool });
}

async function validateLua() {
  const lua = resolveCommand(['lua']);
  const luac = resolveCommand(['luac']);
  if (!lua && !luac) return result('lua', 'skip', 'lua/luac not found.');
  const { directory, filePath } = await writeTargetFile('lua', 'macroRouting.lua', luaHarness());
  if (luac) {
    const syntax = runExecutable(luac, ['-p', filePath], directory);
    if (syntax.status !== 0) return result('lua', 'fail', combineOutput(syntax), { tool: luac });
  }
  if (!lua) return result('lua', 'pass', 'luac -p syntax check passed.', { tool: luac });
  const exec = runExecutable(lua, [filePath], directory);
  return exec.status === 0
    ? result('lua', 'pass', `${luac ? 'luac -p and ' : ''}lua runtime harness passed.`, { tool: lua })
    : result('lua', 'fail', combineOutput(exec), { tool: lua });
}

async function validatePython() {
  const python = resolveCommand(['python', 'py']);
  if (!python) return result('python', 'skip', 'python not found.');
  const { directory, filePath } = await writeTargetFile('python', 'macroRouting.py', pythonHarness());
  const compile = runExecutable(python, ['-m', 'py_compile', filePath], directory);
  if (compile.status !== 0) return result('python', 'fail', combineOutput(compile), { tool: python });
  const exec = runExecutable(python, [filePath], directory);
  return exec.status === 0
    ? result('python', 'pass', 'py_compile and runtime harness passed.', { tool: python })
    : result('python', 'fail', combineOutput(exec), { tool: python });
}

async function validateCpp() {
  const compiler = resolveCommand(['g++', 'clang++', 'cl']);
  if (!compiler) return result('cpp', 'skip', 'C++ compiler not found.');
  const { directory, filePath } = await writeTargetFile('cpp', 'macroRouting.cpp', cppHarness());
  const outPath = path.join(directory, process.platform === 'win32' ? 'macroRouting.exe' : 'macroRouting');
  const isMsvc = /(^|[\\/])cl(\.exe)?$/i.test(compiler);
  const compile = isMsvc
    ? runExecutable(compiler, ['/nologo', '/std:c++20', filePath, `/Fe:${outPath}`], directory)
    : runExecutable(compiler, ['-std=c++20', filePath, '-o', outPath], directory);
  if (compile.status !== 0) return result('cpp', 'fail', combineOutput(compile), { tool: compiler });
  const exec = runExecutable(outPath, [], directory);
  return exec.status === 0
    ? result('cpp', 'pass', 'C++ harness compiled and ran.', { tool: compiler })
    : result('cpp', 'fail', combineOutput(exec), { tool: compiler });
}

async function validateCsharp() {
  const dotnet = resolveCommand(['dotnet']);
  if (!dotnet) return result('csharp', 'skip', 'dotnet SDK not found.');
  const sdks = runExecutable(dotnet, ['--list-sdks'], webRoot);
  if (sdks.status !== 0 || !sdks.stdout.trim()) {
    return result('csharp', 'skip', 'dotnet runtime found, but no .NET SDK is installed for build validation.', { tool: dotnet });
  }
  const directory = path.join(workspaceRoot, 'csharp');
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, 'ScriptHarness.csproj'), [
    '<Project Sdk="Microsoft.NET.Sdk">',
    '  <PropertyGroup>',
    '    <OutputType>Exe</OutputType>',
    '    <TargetFramework>net8.0</TargetFramework>',
    '    <ImplicitUsings>disable</ImplicitUsings>',
    '    <Nullable>enable</Nullable>',
    '  </PropertyGroup>',
    '</Project>',
    '',
  ].join('\n'), 'utf8');
  await writeFile(path.join(directory, 'Program.cs'), csharpHarness(), 'utf8');
  const exec = runExecutable(dotnet, ['run', '--nologo', '--project', path.join(directory, 'ScriptHarness.csproj')], directory);
  return exec.status === 0
    ? result('csharp', 'pass', 'dotnet run harness passed.', { tool: dotnet })
    : result('csharp', 'fail', combineOutput(exec), { tool: dotnet });
}

async function validateGo() {
  const go = resolveCommand(['go']);
  if (!go) return result('go', 'skip', 'Go toolchain not found.');
  const directory = path.join(workspaceRoot, 'go');
  await mkdir(path.join(directory, 'ce'), { recursive: true });
  await mkdir(path.join(directory, 'midi'), { recursive: true });
  await writeFile(path.join(directory, 'go.mod'), 'module ceditor-validator\n\ngo 1.22\n', 'utf8');
  await writeFile(path.join(directory, 'main.go'), goMain(), 'utf8');
  await writeFile(path.join(directory, 'ce', 'ce.go'), goCePackage, 'utf8');
  await writeFile(path.join(directory, 'midi', 'midi.go'), goMidiPackage, 'utf8');
  const exec = runExecutable(go, ['run', '.'], directory);
  return exec.status === 0
    ? result('go', 'pass', 'go run harness passed.', { tool: go })
    : result('go', 'fail', combineOutput(exec), { tool: go });
}

async function validateRust() {
  const rustc = resolveCommand(['rustc']);
  if (!rustc) return result('rust', 'skip', 'rustc not found.');
  const { directory, filePath } = await writeTargetFile('rust', 'macroRouting.rs', rustHarness());
  const outPath = path.join(directory, process.platform === 'win32' ? 'macroRouting.exe' : 'macroRouting');
  const compile = runExecutable(rustc, ['--edition=2021', filePath, '-o', outPath], directory);
  if (compile.status !== 0) return result('rust', 'fail', combineOutput(compile), { tool: rustc });
  const exec = runExecutable(outPath, [], directory);
  return exec.status === 0
    ? result('rust', 'pass', 'rustc harness compiled and ran.', { tool: rustc })
    : result('rust', 'fail', combineOutput(exec), { tool: rustc });
}

async function validateKotlin() {
  const kotlinc = resolveCommand(['kotlinc']);
  if (!kotlinc) return result('kotlin', 'skip', 'Kotlin compiler not found.');
  const { directory, filePath } = await writeTargetFile('kotlin', 'MacroRouting.kt', kotlinHarness());
  const jarPath = path.join(directory, 'macroRouting.jar');
  const compile = runExecutable(kotlinc, [filePath, '-include-runtime', '-d', jarPath], directory);
  if (compile.status !== 0) return result('kotlin', 'fail', combineOutput(compile), { tool: kotlinc });
  const java = resolveCommand(['java']);
  if (!java) return result('kotlin', 'pass', 'kotlinc compiled harness; java not found for runtime pass.', { tool: kotlinc });
  const exec = runExecutable(java, ['-jar', jarPath], directory);
  return exec.status === 0
    ? result('kotlin', 'pass', 'kotlinc compiled and runtime harness passed.', { tool: kotlinc })
    : result('kotlin', 'fail', combineOutput(exec), { tool: kotlinc });
}

async function validateSwift() {
  const swift = resolveCommand(['swift']);
  if (!swift) return result('swift', 'skip', 'Swift toolchain not found.');
  const { directory, filePath } = await writeTargetFile('swift', 'MacroRouting.swift', swiftHarness());
  const exec = runExecutable(swift, [filePath], directory);
  return exec.status === 0
    ? result('swift', 'pass', 'swift script harness passed.', { tool: swift })
    : result('swift', 'fail', combineOutput(exec), { tool: swift });
}

async function validateStructural(target) {
  await writeTargetFile(target, `macroRouting.${target}`, generated(target));
  return validateMarkup(target, generated(target));
}

const validators = [
  validateJavascript,
  validateTypescript,
  validateLua,
  validatePython,
  validateCpp,
  validateCsharp,
  validateGo,
  validateRust,
  validateKotlin,
  validateSwift,
  () => validateStructural('html'),
  () => validateStructural('css'),
];

export async function validateScriptExportToolchains() {
  await resetWorkspace();
  const results = [];
  for (const validator of validators) {
    results.push(await validator());
  }
  return {
    workspaceRoot,
    results,
    failed: results.filter((item) => item.status === 'fail'),
    skipped: results.filter((item) => item.status === 'skip'),
    passed: results.filter((item) => item.status === 'pass'),
  };
}

function printSummary(summary) {
  for (const item of summary.results) {
    const label = item.status.toUpperCase().padEnd(4);
    const tool = item.tool ? ` (${item.tool})` : '';
    console.log(`${label} ${item.target.padEnd(10)} ${item.detail}${tool}`);
  }
  console.log('');
  console.log(`Export validation workspace: ${summary.workspaceRoot}`);
  console.log(`Passed: ${summary.passed.length}; skipped: ${summary.skipped.length}; failed: ${summary.failed.length}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const json = process.argv.includes('--json');
  const strict = process.argv.includes('--strict');
  const summary = await validateScriptExportToolchains();
  if (json) console.log(JSON.stringify(summary, null, 2));
  else printSummary(summary);
  if (summary.failed.length || (strict && summary.skipped.length)) process.exit(1);
}
