// Decompile every function that references one of the given target addresses
// (env CALLERS_OF, ';'-separated hex), e.g. to find the registration site
// that inserts record-id handlers into the receive dispatch map.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.symbol.Reference;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.util.HashSet;
import java.util.Set;

public class DumpCallers extends GhidraScript {
    @Override
    public void run() throws Exception {
        String outPath = System.getenv().getOrDefault("CALLERS_OUT", "/tmp/callers.txt");
        String targets = System.getenv().getOrDefault("CALLERS_OF", "");
        PrintWriter out = new PrintWriter(new FileWriter(outPath));
        DecompInterface decomp = new DecompInterface();
        decomp.toggleCCode(true);
        decomp.openProgram(currentProgram);
        Set<Long> dumped = new HashSet<>();
        int count = 0;

        for (String hex : targets.split(";")) {
            if (hex.trim().isEmpty()) continue;
            Address target = toAddr(Long.decode(hex.trim()));
            out.println("\n######## CALLERS OF " + target + " ########");
            for (Reference ref : getReferencesTo(target)) {
                Function caller = getFunctionContaining(ref.getFromAddress());
                if (caller == null) continue;
                long key = caller.getEntryPoint().getOffset();
                out.println("  ref from " + caller.getName() + " @ " + caller.getEntryPoint());
                if (!dumped.add(key) || count >= 120) continue;
                count++;
                out.println("================================================================");
                out.println("== " + caller.getName() + " @ " + caller.getEntryPoint());
                out.println("================================================================");
                DecompileResults r = decomp.decompileFunction(caller, 90, monitor);
                if (r != null && r.getDecompiledFunction() != null) {
                    out.println(r.getDecompiledFunction().getC());
                } else {
                    out.println("// decompile failed");
                }
                out.flush();
            }
        }
        out.println("\n// " + count + " callers dumped");
        out.close();
        println("DONE -> " + outPath + " (" + count + ")");
    }
}
