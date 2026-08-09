// Focused CTRL/EXP assignment-encoder finder: a function that (a) has the
// message constants 0x0f (CTRL type) and 0x14 (sub) in its operands AND (b)
// actually calls the send/wrap path. That combination is rare.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.listing.Instruction;
import ghidra.program.model.listing.InstructionIterator;
import ghidra.program.model.scalar.Scalar;
import ghidra.util.task.TaskMonitor;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.util.HashSet;
import java.util.Set;

public class ScanCtrlEnc2 extends GhidraScript {
    @Override
    public void run() throws Exception {
        String outPath = System.getenv().getOrDefault("CE2_OUT", "/tmp/ctrl_enc2.txt");
        PrintWriter out = new PrintWriter(new FileWriter(outPath));
        DecompInterface d = new DecompInterface(); d.toggleCCode(true); d.openProgram(currentProgram);

        // send/wrap/encoder + thin senders
        long[] sendPath = { 0x5af4d0L, 0x5d1b10L, 0x4925c0L,
                0x5b1090L, 0x5b1110L, 0x5b15f0L, 0x5b1610L, 0x5b3350L, 0x5b13d0L };
        Set<Function> senders = new HashSet<>();
        for (long a : sendPath) { Function f = getFunctionAt(toAddr(a)); if (f != null) senders.add(f); }

        FunctionIterator fit = currentProgram.getFunctionManager().getFunctions(true);
        int hits = 0;
        while (fit.hasNext()) {
            Function f = fit.next();
            Set<Function> called = f.getCalledFunctions(TaskMonitor.DUMMY);
            boolean callsSend = false;
            for (Function s : senders) if (called.contains(s)) { callsSend = true; break; }
            if (!callsSend) continue;
            Set<Long> scal = new HashSet<>();
            InstructionIterator ii = currentProgram.getListing().getInstructions(f.getBody(), true);
            while (ii.hasNext()) {
                Instruction ins = ii.next();
                for (int op = 0; op < ins.getNumOperands(); op++)
                    for (Object o : ins.getOpObjects(op))
                        if (o instanceof Scalar) scal.add(((Scalar) o).getUnsignedValue() & 0xff);
            }
            // needs the CTRL record type 0x0f AND the sub-command 0x14
            if (scal.contains(0x0fL) && scal.contains(0x14L)) {
                hits++;
                out.println("\n################################################################");
                out.println("# ENC " + f.getName() + " @ " + f.getEntryPoint()
                        + "   has0e=" + scal.contains(0x0eL) + " has08=" + scal.contains(0x08L));
                out.println("################################################################");
                DecompileResults r = d.decompileFunction(f, 60, monitor);
                out.println(r != null && r.getDecompiledFunction() != null
                        ? r.getDecompiledFunction().getC() : "// fail");
                out.flush();
            }
        }
        out.println("\n// " + hits + " candidates");
        out.close();
        println("DONE ctrl-enc2 -> " + outPath + " (" + hits + ")");
    }
}
