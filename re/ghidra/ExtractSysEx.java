// Headless post-analysis: recover the GP-200 live-control SysEx protocol from
// the official editor. Strategy: find the message-template bytes and the named
// protocol strings, then decompile every function that references them.
import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.DecompInterface;
import ghidra.app.decompiler.DecompileResults;
import ghidra.program.model.address.Address;
import ghidra.program.model.listing.Function;
import ghidra.program.model.listing.FunctionIterator;
import ghidra.program.model.symbol.Reference;
import ghidra.program.model.symbol.ReferenceIterator;
import ghidra.program.model.symbol.ReferenceManager;
import java.io.FileWriter;
import java.io.PrintWriter;
import java.util.HashSet;
import java.util.Set;

public class ExtractSysEx extends GhidraScript {
    PrintWriter out;
    DecompInterface decomp;
    Set<Long> dumped = new HashSet<>();
    int funcCount = 0;

    @Override
    public void run() throws Exception {
        String outPath = System.getenv("SYSEX_OUT");
        if (outPath == null) outPath = "/tmp/sysex_extract.txt";
        out = new PrintWriter(new FileWriter(outPath));
        decomp = new DecompInterface();
        decomp.toggleCCode(true);
        decomp.openProgram(currentProgram);

        line("=== GP-200 SysEx protocol extraction ===");
        line("program : " + currentProgram.getName());
        line("imageBase: " + currentProgram.getImageBase());
        line("functions: " + currentProgram.getFunctionManager().getFunctionCount());

        // 1) The 8-byte live-protocol header template  F0 21 25 7E 47 50 2D 32
        //    (search the manufacturer+ascii tail, F0 may be added separately)
        section("REFS TO HEADER TEMPLATE  21 25 7E 47 50 2D 32");
        huntBytes("\\x21\\x25\\x7e\\x47\\x50\\x2d\\x32");

        // 2) Named protocol strings + the hex formatter used to emit byte runs
        for (String s : new String[]{
                "ADDR_SYS_SOFTWARE_STATE", "ADDR_SYS_SOFTWARE_JUMP",
                "module_state", "%02X,", "%02x,"}) {
            section("REFS TO STRING  \"" + s + "\"");
            huntString(s);
        }

        // 3) Anything the RTTI/symbol pass named MIDI / SysEx / USB-interface
        section("FUNCTIONS NAMED midi/sysex/usb-intf/reciver");
        FunctionIterator fit = currentProgram.getFunctionManager().getFunctions(true);
        while (fit.hasNext()) {
            Function f = fit.next();
            String n = f.getName().toLowerCase();
            if (n.contains("midi") || n.contains("sysex") || n.contains("usbintf")
                    || n.contains("reciver") || n.contains("receiver") || n.contains("packsysex")) {
                dumpFunction(f, "named:" + f.getName());
            }
        }

        line("");
        line("=== extraction complete: " + funcCount + " functions dumped ===");
        out.close();
        println("DONE -> " + outPath + " (" + funcCount + " functions)");
    }

    void huntBytes(String pattern) throws Exception {
        Address a = currentProgram.getMinAddress();
        int hits = 0;
        while (a != null && hits < 40) {
            Address found = findBytes(a, pattern);
            if (found == null) break;
            hits++;
            line("-- match at " + found);
            dumpRefsTo(found);
            a = found.add(1);
        }
        if (hits == 0) line("(no byte match)");
    }

    void huntString(String s) throws Exception {
        // escape regex-significant chars in the literal
        StringBuilder pat = new StringBuilder();
        for (char c : s.toCharArray()) {
            if ("\\^$.|?*+()[]{}".indexOf(c) >= 0) pat.append('\\');
            pat.append(c);
        }
        Address a = currentProgram.getMinAddress();
        int hits = 0;
        while (a != null && hits < 20) {
            Address found = findBytes(a, pat.toString());
            if (found == null) break;
            hits++;
            line("-- string at " + found);
            dumpRefsTo(found);
            a = found.add(1);
        }
        if (hits == 0) line("(string not found)");
    }

    void dumpRefsTo(Address target) {
        ReferenceManager rm = currentProgram.getReferenceManager();
        ReferenceIterator it = rm.getReferencesTo(target);
        int refs = 0;
        while (it.hasNext()) {
            Reference r = it.next();
            Function f = getFunctionContaining(r.getFromAddress());
            if (f != null) { dumpFunction(f, "xref@" + r.getFromAddress()); refs++; }
            else line("   ref from " + r.getFromAddress() + " (no function)");
        }
        // also decompile a function that *contains* the bytes (inline template writer)
        Function host = getFunctionContaining(target);
        if (host != null) dumpFunction(host, "contains-bytes");
        if (refs == 0 && host == null) line("   (no code references)");
    }

    void dumpFunction(Function f, String why) {
        long key = f.getEntryPoint().getOffset();
        if (dumped.contains(key)) return;
        dumped.add(key);
        funcCount++;
        line("");
        line("################################################################");
        line("# FUNCTION " + f.getName() + " @ " + f.getEntryPoint() + "   [" + why + "]");
        line("################################################################");
        try {
            DecompileResults dr = decomp.decompileFunction(f, 60, monitor);
            if (dr != null && dr.decompileCompleted() && dr.getDecompiledFunction() != null) {
                line(dr.getDecompiledFunction().getC());
            } else {
                line("// (decompile failed: " + (dr != null ? dr.getErrorMessage() : "null") + ")");
            }
        } catch (Exception e) {
            line("// (decompile exception: " + e.getMessage() + ")");
        }
    }

    void section(String t) { line(""); line("=================================================================="); line("== " + t); line("=================================================================="); }
    void line(String s) { out.println(s); out.flush(); }
}
