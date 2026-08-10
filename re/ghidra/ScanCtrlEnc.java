// Find the CTRL/EXP live-assignment encoder: a function whose operand
// immediates include the distinctive record types 0x0E (EXP) and 0x0F (CTRL)
// together with the sub-command 0x14 and payload-size 0x08.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.scalar.Scalar;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.util.HashSet;
import java.util.Set;

public class ScanCtrlEnc extends GhidraScript {
    @Override
    public void run() throws Exception {
        String outPath = System.getenv().getOrDefault("CE_OUT", "/tmp/ctrl_enc.txt");
        PrintWriter out = new PrintWriter(new FileWriter(outPath));
        DecompInterface d = new DecompInterface(); d.toggleCCode(true); d.openProgram(currentProgram);
        FunctionIterator fit = currentProgram.getFunctionManager().getFunctions(true);
        int hits = 0;
        while (fit.hasNext()) {
            Function f = fit.next();
            Set<Long> s = new HashSet<>();
            InstructionIterator ii = currentProgram.getListing().getInstructions(f.getBody(), true);
            while (ii.hasNext()) {
                Instruction ins = ii.next();
                for (int op = 0; op < ins.getNumOperands(); op++)
                    for (Object o : ins.getOpObjects(op))
                        if (o instanceof Scalar) s.add(((Scalar) o).getUnsignedValue() & 0xff);
            }
            // distinctive: both record types 0x0E and 0x0F, plus sub 0x14 and size 0x08
            if (s.contains(0x0eL) && s.contains(0x0fL) && s.contains(0x14L) && s.contains(0x08L)) {
                hits++;
                out.println("\n################################################################");
                out.println("# CTRL-ENC CANDIDATE " + f.getName() + " @ " + f.getEntryPoint());
                out.println("################################################################");
                DecompileResults r = d.decompileFunction(f, 60, monitor);
                out.println(r != null && r.getDecompiledFunction() != null ? r.getDecompiledFunction().getC() : "// fail");
                out.flush();
            }
        }
        out.println("\n// " + hits + " candidates");
        out.close();
        println("DONE ctrl-enc -> " + outPath + " (" + hits + ")");
    }
}
