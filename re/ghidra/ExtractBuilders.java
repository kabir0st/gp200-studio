// Third pass: the per-message builders are the callers of the frame-wrapper
// FUN_005d1b10 (prepends F0 / appends F7) and of the thin send wrappers.
// Decompile every unique caller -> the full per-message builder set.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.Set;

public class ExtractBuilders extends GhidraScript {
    PrintWriter out;
    DecompInterface decomp;
    Set<Long> dumped = new HashSet<>();

    @Override
    public void run() throws Exception {
        String outPath = System.getenv("BUILDERS_OUT");
        if (outPath == null) outPath = "/tmp/builders.txt";
        out = new PrintWriter(new FileWriter(outPath));
        decomp = new DecompInterface();
        decomp.toggleCCode(true);
        decomp.openProgram(currentProgram);

        long[] seeds = { 0x5d1b10L, 0x5b1090L, 0x5b1110L, 0x5b15f0L, 0x5b1610L, 0x5b3350L, 0x5b13d0L };
        Set<Function> builders = new LinkedHashSet<>();
        for (long s : seeds) {
            Function seed = getFunctionAt(toAddr(s));
            if (seed == null) continue;
            ReferenceIterator it = currentProgram.getReferenceManager().getReferencesTo(seed.getEntryPoint());
            int n = 0;
            while (it.hasNext()) {
                Reference r = it.next();
                if (!r.getReferenceType().isCall()) continue;
                Function c = getFunctionContaining(r.getFromAddress());
                if (c != null && c.getEntryPoint().getOffset() != s) { builders.add(c); n++; }
            }
            line("// seed " + seed.getName() + " : " + n + " callers");
        }
        line("=== decompiling " + builders.size() + " builder functions ===");
        for (Function f : builders) dump(f);
        out.close();
        println("DONE builders -> " + outPath + " (" + dumped.size() + ")");
    }

    void dump(Function f) {
        long k = f.getEntryPoint().getOffset();
        if (!dumped.add(k)) return;
        line("");
        line("################################################################");
        line("# " + f.getName() + " @ " + f.getEntryPoint());
        line("################################################################");
        try {
            DecompileResults dr = decomp.decompileFunction(f, 60, monitor);
            if (dr != null && dr.getDecompiledFunction() != null) line(dr.getDecompiledFunction().getC());
            else line("// decompile failed");
        } catch (Exception e) { line("// exception: " + e.getMessage()); }
    }
    void line(String s) { out.println(s); out.flush(); }
}
