// Comprehensive builder finder: the editor invokes senders indirectly (JUCE
// listeners), so call-graph tracing fails. Instead scan EVERY function for the
// header signature -- either a reference to the header constant, or the rare
// immediate bytes of "GP-2" (0x7e,0x2d,0x50,0x47,0x32) appearing in operands.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.lang.OperandType;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.scalar.Scalar;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.util.HashSet;
import java.util.Set;

public class ScanHeaderBuilders extends GhidraScript {
    PrintWriter out;
    DecompInterface decomp;

    @Override
    public void run() throws Exception {
        String outPath = System.getenv("HB_OUT");
        if (outPath == null) outPath = "/tmp/header_builders.txt";
        out = new PrintWriter(new FileWriter(outPath));
        decomp = new DecompInterface();
        decomp.toggleCCode(true);
        decomp.openProgram(currentProgram);

        FunctionIterator fit = currentProgram.getFunctionManager().getFunctions(true);
        int scanned = 0, hits = 0;
        while (fit.hasNext()) {
            Function f = fit.next();
            scanned++;
            Set<Long> scal = new HashSet<>();
            boolean refHdr = false;
            InstructionIterator ii = currentProgram.getListing().getInstructions(f.getBody(), true);
            while (ii.hasNext()) {
                Instruction ins = ii.next();
                int n = ins.getNumOperands();
                for (int op = 0; op < n; op++) {
                    for (Object o : ins.getOpObjects(op)) {
                        if (o instanceof Scalar) scal.add(((Scalar) o).getUnsignedValue() & 0xff);
                        if (o instanceof Address) {
                            long a = ((Address) o).getOffset();
                            if (a == 0x77f544L || a == 0x7800e0L || a == 0x77f514L) refHdr = true;
                        }
                    }
                }
            }
            // signature: rare "GP-2" bytes together, OR direct header-const ref
            boolean sig = scal.contains(0x7eL) && scal.contains(0x2dL) && scal.contains(0x50L) && scal.contains(0x32L);
            if (sig || refHdr) {
                hits++;
                line("");
                line("################################################################");
                line("# BUILDER " + f.getName() + " @ " + f.getEntryPoint()
                        + (refHdr ? "  [refs-hdr-const]" : "  [immediate-hdr]"));
                line("################################################################");
                try {
                    DecompileResults dr = decomp.decompileFunction(f, 60, monitor);
                    if (dr != null && dr.getDecompiledFunction() != null)
                        line(dr.getDecompiledFunction().getC());
                    else line("// decompile failed");
                } catch (Exception e) { line("// exception: " + e.getMessage()); }
            }
        }
        line("");
        line("// scanned " + scanned + " functions, " + hits + " header-builders");
        out.close();
        println("DONE header-builders -> " + outPath + " (" + hits + " of " + scanned + ")");
    }
    void line(String s) { out.println(s); out.flush(); }
}
