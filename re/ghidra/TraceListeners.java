// Decompile the virtual methods of classes whose vftable symbol matches a
// name pattern (env VF_PATTERNS, ';'-separated substrings), plus explicitly
// listed function addresses (env VF_FUNCS, ';'-separated hex), plus one level
// of direct callees for everything dumped. Used to read listener callbacks
// (RenameAndSave*, MIDIReciverListener) and the frame builders they call.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Symbol;
import ghidra.program.model.symbol.SymbolIterator;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

public class TraceListeners extends GhidraScript {
    PrintWriter out;
    DecompInterface decomp;
    Set<Long> dumped = new HashSet<>();
    int funcCount = 0;
    static final int MAX_FUNCS = 220;
    static final int MAX_VF_SLOTS = 96;

    @Override
    public void run() throws Exception {
        String outPath = System.getenv().getOrDefault("VF_OUT", "/tmp/listeners.txt");
        String[] patterns = System.getenv().getOrDefault("VF_PATTERNS", "RenameAndSave")
                .split(";");
        String funcsEnv = System.getenv().getOrDefault("VF_FUNCS", "");
        out = new PrintWriter(new FileWriter(outPath));
        decomp = new DecompInterface();
        decomp.toggleCCode(true);
        decomp.openProgram(currentProgram);

        List<Function> roots = new ArrayList<>();

        // vftables of matching classes -> their virtual methods are roots
        SymbolIterator sit = currentProgram.getSymbolTable().getAllSymbols(true);
        while (sit.hasNext()) {
            Symbol s = sit.next();
            String full = s.getName(true);
            if (!full.contains("vftable")) continue;
            boolean hit = false;
            for (String p : patterns) {
                if (!p.isEmpty() && full.contains(p)) { hit = true; break; }
            }
            if (!hit) continue;
            out.println("\n######## VFTABLE " + full + " @ " + s.getAddress() + " ########");
            collectVftableMethods(s.getAddress(), roots);
        }

        // explicitly named function addresses are roots too
        for (String hex : funcsEnv.split(";")) {
            if (hex.trim().isEmpty()) continue;
            Address a = toAddr(Long.decode(hex.trim()));
            Function f = getFunctionContaining(a);
            if (f != null) {
                out.println("\n######## EXPLICIT ROOT " + f.getName() + " @ "
                        + f.getEntryPoint() + " ########");
                roots.add(f);
            } else {
                out.println("\n######## no function at " + hex + " ########");
            }
        }

        // depth 0: roots; depth 1: their direct callees
        List<Function> callees = new ArrayList<>();
        for (Function f : roots) {
            dumpFunction(f, "root");
            for (Function c : f.getCalledFunctions(monitor)) callees.add(c);
        }
        out.println("\n======== DEPTH-1 CALLEES ========");
        for (Function c : callees) dumpFunction(c, "callee");

        out.println("\n// " + funcCount + " functions dumped");
        out.close();
        println("DONE -> " + outPath + " (" + funcCount + " functions)");
    }

    void collectVftableMethods(Address vft, List<Function> roots) throws Exception {
        int misses = 0;
        for (int i = 0; i < MAX_VF_SLOTS && misses < 2; i++) {
            long ptr;
            try {
                ptr = currentProgram.getMemory().getInt(vft.add(i * 4L)) & 0xffffffffL;
            } catch (Exception e) {
                break;
            }
            Function f = getFunctionAt(toAddr(ptr));
            if (f == null) { misses++; continue; }
            misses = 0;
            out.println("  slot " + i + " -> " + f.getName() + " @ " + f.getEntryPoint());
            roots.add(f);
        }
    }

    void dumpFunction(Function f, String why) {
        if (f == null || funcCount >= MAX_FUNCS) return;
        long key = f.getEntryPoint().getOffset();
        if (!dumped.add(key)) return;
        funcCount++;
        out.println("\n================================================================");
        out.println("== [" + why + "] " + f.getName() + " @ " + f.getEntryPoint());
        out.println("================================================================");
        DecompileResults r = decomp.decompileFunction(f, 60, monitor);
        if (r != null && r.getDecompiledFunction() != null) {
            out.println(r.getDecompiledFunction().getC());
        } else {
            out.println("// decompile failed");
        }
        out.flush();
    }
}
