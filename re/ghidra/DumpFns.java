import ghidra.app.script.GhidraScript;
import ghidra.app.decompiler.*;
import ghidra.program.model.listing.Function;
public class DumpFns extends GhidraScript {
  public void run() throws Exception {
    DecompInterface d=new DecompInterface(); d.toggleCCode(true); d.openProgram(currentProgram);
    String list=System.getenv("FN_LIST"); if(list==null) list="0x464260";
    java.io.PrintWriter o=new java.io.PrintWriter(new java.io.FileWriter(System.getenv().getOrDefault("OUT","/tmp/fns.txt")));
    for(String s:list.split(",")){ long a=Long.decode(s.trim()); Function f=getFunctionAt(toAddr(a));
      if(f==null){o.println("// no fn at "+s);continue;}
      o.println("# "+f.getName()+" @ "+f.getEntryPoint());
      DecompileResults r=d.decompileFunction(f,60,monitor);
      o.println(r!=null&&r.getDecompiledFunction()!=null?r.getDecompiledFunction().getC():"// fail"); o.flush(); }
    o.close(); println("DONE"); } }
