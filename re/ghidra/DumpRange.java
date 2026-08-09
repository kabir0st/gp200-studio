// Decompile every function whose entry point falls in [START, END). Used to
// read a whole class implementation cluster (e.g. FSSettings around 0x464260).
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import java.io.FileWriter;
import java.io.PrintWriter;

public class DumpRange extends GhidraScript {
    @Override
    public void run() throws Exception {
        long start = Long.decode(System.getenv().getOrDefault("RANGE_START", "0x463000"));
        long end = Long.decode(System.getenv().getOrDefault("RANGE_END", "0x469000"));
        String outPath = System.getenv().getOrDefault("RANGE_OUT", "/tmp/range.txt");
        PrintWriter out = new PrintWriter(new FileWriter(outPath));
        DecompInterface d = new DecompInterface(); d.toggleCCode(true); d.openProgram(currentProgram);
        FunctionIterator fit = currentProgram.getFunctionManager().getFunctions(true);
        int n = 0;
        while (fit.hasNext()) {
            Function f = fit.next();
            long a = f.getEntryPoint().getOffset();
            if (a < start || a >= end) continue;
            n++;
            out.println("\n################################################################");
            out.println("# " + f.getName() + " @ " + f.getEntryPoint());
            out.println("################################################################");
            DecompileResults r = d.decompileFunction(f, 60, monitor);
            out.println(r != null && r.getDecompiledFunction() != null
                    ? r.getDecompiledFunction().getC() : "// fail");
            out.flush();
        }
        out.println("\n// " + n + " functions in [" + Long.toHexString(start) + "," + Long.toHexString(end) + ")");
        out.close();
        println("DONE range -> " + outPath + " (" + n + ")");
    }
}
