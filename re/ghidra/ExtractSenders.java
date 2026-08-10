// Second pass (run with -process, no re-analysis): the send primitive is
// FUN_005af4d0 (called as opcode 5 with the F0..F7 buffer). Every outgoing
// SysEx builder calls it. Decompile the primitive + all its callers.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;
import ghidra.program.model.symbol.RefType;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Set;

public class ExtractSenders extends GhidraScript {
    PrintWriter out;
    DecompInterface decomp;
    Set<Long> dumped = new HashSet<>();

    @Override
    public void run() throws Exception {
        String outPath = System.getenv("SENDERS_OUT");
        if (outPath == null) outPath = "/tmp/senders.txt";
        out = new PrintWriter(new FileWriter(outPath));
        decomp = new DecompInterface();
        decomp.toggleCCode(true);
        decomp.openProgram(currentProgram);

        // seeds: send primitive + the two header-referencing functions + module_state fn
        long[] seeds = { 0x5af4d0L, 0x5b09d0L, 0x5b4520L, 0x5bfe70L };
        Set<Function> builders = new LinkedHashSet<>();

        for (long s : seeds) {
            Function seed = getFunctionAt(toAddr(s));
            if (seed == null) { line("// no function at " + Long.toHexString(s)); continue; }
            line("== callers of " + seed.getName() + " @ " + seed.getEntryPoint());
            ReferenceIterator it = currentProgram.getReferenceManager().getReferencesTo(seed.getEntryPoint());
            int n = 0;
            while (it.hasNext()) {
                Reference r = it.next();
                if (r.getReferenceType() != RefType.UNCONDITIONAL_CALL
                        && r.getReferenceType() != RefType.CONDITIONAL_CALL
                        && !r.getReferenceType().isCall()) continue;
                Function c = getFunctionContaining(r.getFromAddress());
                if (c != null) { builders.add(c); n++; line("   caller: " + c.getName() + " @ " + c.getEntryPoint() + "  (call@" + r.getFromAddress() + ")"); }
            }
            line("   (" + n + " call sites)");
            // decompile the seed itself too (only 0x5af4d0 send primitive is small/interesting)
            if (s == 0x5af4d0L) builders.add(seed);
        }

        line("");
        line("=== decompiling " + builders.size() + " functions ===");
        for (Function f : builders) dumpFunction(f);
        out.close();
        println("DONE senders -> " + outPath + " (" + dumped.size() + " funcs)");
    }

    void dumpFunction(Function f) {
        long key = f.getEntryPoint().getOffset();
        if (dumped.contains(key)) return;
        dumped.add(key);
        line("");
        line("################################################################");
        line("# " + f.getName() + " @ " + f.getEntryPoint());
        line("################################################################");
        try {
            DecompileResults dr = decomp.decompileFunction(f, 60, monitor);
            if (dr != null && dr.decompileCompleted() && dr.getDecompiledFunction() != null)
                line(dr.getDecompiledFunction().getC());
            else line("// decompile failed");
        } catch (Exception e) { line("// exception: " + e.getMessage()); }
    }

    void line(String s) { out.println(s); out.flush(); }
}
