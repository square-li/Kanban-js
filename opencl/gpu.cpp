#include "gpu.h"
#include "logging.h"
#include <fstream>
#include <iostream>
#include <iomanip>

#define MAX_SOURCE_SIZE (0x100000)

Logger logGPU("../logfiles/logGPU.txt", "[GPU] ");


std::string OpenCLFunctions::getDeviceInfo(cl_device_id deviceId, cl_device_info informationRequested) {
  size_t outputBufferSize = 0;
  const size_t infoSize = 10000;
  char buffer[infoSize];
  clGetDeviceInfo(deviceId, informationRequested, infoSize, buffer, &outputBufferSize);
  std::string result;
  if (outputBufferSize > 0)
    result = std::string(buffer, outputBufferSize - 1);
  return result;
}

std::string OpenCLFunctions::getDriverVersion(cl_device_id deviceId) {
  return getDeviceInfo(deviceId, CL_DRIVER_VERSION);
}

bool OpenCLFunctions::getIsLittleEndian(cl_device_id deviceId) {
  std::string returnValue = getDeviceInfo(deviceId, CL_DEVICE_ENDIAN_LITTLE);
  bool result = (returnValue[0] == CL_TRUE);
  return result;
}

long long OpenCLFunctions::getGlobalMemorySize(cl_device_id deviceId) {
  const size_t infoSize = sizeof(cl_ulong);
  char buffer[infoSize];
  for (unsigned i = 0; i < infoSize; i ++)
    buffer[i] = 0;
  size_t outputBufferSize = 0;
  clGetDeviceInfo(deviceId, CL_DEVICE_GLOBAL_MEM_SIZE, infoSize, buffer, &outputBufferSize);
  long long result = 0;
  for (unsigned i = 8; i != 0; i --) {
    result *= 256;
    result += (int) ((unsigned char) buffer[i - 1]);
  }
  return result;
}

std::string OpenCLFunctions::getDeviceName(cl_device_id deviceId) {
  return (std::string) getDeviceInfo(deviceId, CL_DEVICE_NAME);
}

SharedMemory::SharedMemory() {
  this->name = "";
  this->flagIsHOSTWritable = true;
  this->theMemory = 0;
  this->typE = this->typeVoidPointer;
  this->uintValue = 0;
}

void SharedMemory::ReleaseMe() {
  clReleaseMemObject(this->theMemory);
  this->theMemory = 0;
  this->name = "";
}

SharedMemory::~SharedMemory() {
  this->ReleaseMe();
}

GPUKernel::GPUKernel() {
  this->local_item_size = 32;
  this->global_item_size = 32;
}

GPUKernel::~GPUKernel() {
  this->kernel = 0;
  this->program = 0;
  for (unsigned i = 0; i < this->inputs.size(); i ++)
    this->inputs[i]->ReleaseMe();
  for (unsigned i = 0; i < this->outputs.size(); i ++)
    this->outputs[i]->ReleaseMe();
  cl_int ret;
  (void) ret;
  ret = clReleaseProgram(this->program);
  ret = clReleaseKernel(this->kernel);
}

GPU::GPU() {
  this->flagVerbose = false;
  this->flagInitializedPlatform = false;
  this->flagInitializedKernels = false;
}

bool GPU::initializeAll() {
  if (! this->initializePlatform())
    return false;
  if (! this->initializeKernels())
    return false;
  return true;
}

bool GPU::initializePlatform() {
  if (this->flagInitializedPlatform)
    return true;
  this->context = 0;
  cl_int ret = 0;
  ret = clGetPlatformIDs(2, this->platformIds, &this->numberOfPlatforms);
  if (ret != CL_SUCCESS) {
    logGPU << "Failed to get platforms." << Logger::endL;
    return false;
  }
  if (this->flagVerbose) {
    logGPU << "Number of platforms: " << this->numberOfPlatforms << "\n";
  }
  cl_device_type desiredDeviceType = CL_DEVICE_TYPE_GPU;
  std::string deviceDescription = desiredDeviceType == CL_DEVICE_TYPE_CPU ? "CPU" : "GPU";
  for (unsigned i = 0; i < this->numberOfPlatforms; i ++) {
    ret = clGetDeviceIDs(this->platformIds[i], desiredDeviceType, 2, this->allDevices, &this->numberOfDevices);
    if (ret == CL_SUCCESS)
      break;
  }
  if (ret != CL_SUCCESS) {
    logGPU << "Failed to get device of type: " << deviceDescription << Logger::endL;
    return false;
  }
  if (this->flagVerbose) {
    logGPU << "Number of devices of type: " << deviceDescription << ": " << this->numberOfDevices << "\n";
  }
  this->currentDeviceId = this->allDevices[0];
  if (this->flagVerbose) {
    logGPU << "Device name: " << OpenCLFunctions::getDeviceName(this->currentDeviceId) << "\n";
    logGPU << "Driver version: " << OpenCLFunctions::getDriverVersion(this->currentDeviceId) << "\n";
    logGPU << "Is little endian: " << OpenCLFunctions::getIsLittleEndian(this->currentDeviceId) << "\n";
    logGPU << "Memory: " << OpenCLFunctions::getGlobalMemorySize(this->currentDeviceId) << "\n";
  }
  // Create an OpenCL context
  logGPU << "About to create GPU context ..." << Logger::endL;
  this->context = clCreateContext(NULL, 1, &this->currentDeviceId, NULL, NULL, &ret);
  logGPU << "Context created." << Logger::endL;
  if (ret != CL_SUCCESS) {
    logGPU << "Failed to create context." << Logger::endL;
    return false;
  }
  logGPU << "About to create GPU queue ..." << Logger::endL;
  this->commandQueue = clCreateCommandQueue(
    this->context, this->currentDeviceId,
    CL_QUEUE_OUT_OF_ORDER_EXEC_MODE_ENABLE,
    &ret
  );
  logGPU << "GPU queue created." << Logger::endL;
  if (ret != CL_SUCCESS) {
    logGPU << "Failed to create command queue." << Logger::endL;
    return false;
  }
  this->flagInitializedPlatform = true;
  return true;
}

bool GPU::initializeKernels() {
  if (this->flagInitializedKernels)
    return true;
  if (!this->initializePlatform())
    return false;
  //if (!this->createKernel(
  //      this->kernelSHA256,
  //      {"result"},
  //      {SharedMemory::typeVoidPointer},
  //      {"offset", "length", "messageIndex", "message"},
  //      {SharedMemory::typeUint, SharedMemory::typeUint, SharedMemory::typeUint, SharedMemory::typeVoidPointer}
  //))
  //  return false;
  //if (!this->createKernel(
  //      this->kernelTestBuffer,
  //      {"buffer"},
  //      {SharedMemory::typeVoidPointer},
  //      {},
  //      {}
  //))
  //  return false;
  if (!this->createKernel(
        this->kernelInitializeMultiplicationContext,
        {"outputMultiplicationContext"},
        {
          SharedMemory::typeVoidPointer,
        },
        {},
        {}
  ))
    return false;
  if (!this->createKernel(
        this->kernelInitializeGeneratorContext,
        {"outputGeneratorContext"},
        {
          SharedMemory::typeVoidPointer,
        },
        {},
        {}
  ))
    return false;
  //if (!this->createKernel(
  //      this->kernelVerifySignature,
  //      {"output"},
  //      {
  //        SharedMemory::typeVoidPointer,
  //      },
  //      {"inputMultiplicationTable", "inputSignatureR", "inputSignatureS", "inputPublicKey", "inputMessage"},
  //      {SharedMemory::typeVoidPointer, SharedMemory::typeVoidPointer, SharedMemory::typeVoidPointer, SharedMemory::typeVoidPointer, SharedMemory::typeVoidPointer}
  //))
  //  return false;
  this->flagInitializedKernels = true;
  return true;
}

bool GPU::createKernel(
  const std::string& fileNameNoExtension,
  const std::vector<std::string>& outputs,
  const std::vector<int>& outputTypes,
  const std::vector<std::string>& inputs,
  const std::vector<int>& inputTypes
) {
  std::shared_ptr<GPUKernel> incomingKernel = std::make_shared<GPUKernel>();
  if (!incomingKernel->constructFromFileName(fileNameNoExtension, outputs, outputTypes, inputs, inputTypes, *this))
    return false;
  this->theKernels[fileNameNoExtension] = incomingKernel;
  return true;
}

GPU::~GPU() {
  cl_int ret = 0;
  (void) ret;
  ret = clFlush(this->commandQueue);
  ret = clFinish(this->commandQueue);
  ret = clReleaseCommandQueue(this->commandQueue);
  this->commandQueue = NULL;
  ret = clReleaseContext(this->context);
  this->context = 0;
}

std::string GPU::kernelSHA256 = "sha256GPU";
std::string GPU::kernelTestBuffer = "testBuffer";
std::string GPU::kernelInitializeMultiplicationContext = "secp256k1_opencl_compute_multiplication_context";
std::string GPU::kernelInitializeGeneratorContext = "secp256k1_opencl_compute_generator_context";
std::string GPU::kernelVerifySignature = "secp256k1_opencl_verify_signature";

const int maxProgramBuildBufferSize = 10000000;
char programBuildBuffer[maxProgramBuildBufferSize];

bool GPUKernel::constructFromFileName(
  const std::string& fileNameNoExtension,
  const std::vector<std::string>& outputNames,
  const std::vector<int>& outputTypes,
  const std::vector<std::string>& inputNames,
  const std::vector<int>& inputTypes,
  GPU& ownerGPU
) {
  this->owner = &ownerGPU;
  this->name = fileNameNoExtension;
  std::string fileName = "../opencl/cl/" + fileNameNoExtension + ".cl";
  std::ifstream theFile(fileName);
  if (!theFile.is_open()) {
    logGPU << "Failed to open " << fileName << "\n";
    return false;
  }
  std::string source_str((std::istreambuf_iterator<char>(theFile)), std::istreambuf_iterator<char>());
  if (this->owner->flagVerbose) {
    logGPU << "Program file name: " << fileName << "\n";
  }
  logGPU << "Source file read: \n" << fileName << Logger::endL;
  size_t sourceSize = source_str.size();
  const char* sourceCString = source_str.c_str();
  cl_int ret;
  this->program = clCreateProgramWithSource(
    this->owner->context, 1,
    (const char **)& sourceCString,
    (const size_t *)& sourceSize, &ret
  );
  if (ret != CL_SUCCESS) {
    logGPU << "Failed to create program from source. " << Logger::endL;
    return false;
  }
  logGPU << "Building program: " << this->name << "..." << Logger::endL;
  //std::string programOptions = "-cl-std=CL2.0";
  ret = clBuildProgram(
    this->program, 1, &this->owner->currentDeviceId,
    NULL,
    //programOptions.c_str(),
    NULL, NULL
  );
  if (ret != CL_SUCCESS) {
    logGPU << "Failed to build the program. Return code: " << ret << Logger::endL;
    size_t logSize;
    ret = clGetProgramBuildInfo(
      this->program, this->owner->currentDeviceId,
      CL_PROGRAM_BUILD_LOG, maxProgramBuildBufferSize,
      &programBuildBuffer, &logSize
    );
    if (ret != CL_SUCCESS) {
      logGPU << "Failed to fetch program build info, return code: " << ret << Logger::endL;
      return false;
    }
    if (logSize > 0)
      logSize --;
    std::string theLog(programBuildBuffer, logSize);
    logGPU << theLog;
    return false;
  }
  logGPU << "Program built." << Logger::endL;
  logGPU << "Creating openCL kernel..." << Logger::endL;
  this->kernel = clCreateKernel(this->program, this->name.c_str(), &ret);
  if (ret != CL_SUCCESS) {
    logGPU << "Failed to allocate kernel. Return code: " << ret << Logger::endL;
    logGPU << "Please note we \e[31mrequire the __kernel function name be the same\e[39m as the no-extension filename: \e[31m"
           << this->name << "\e[39m." << Logger::endL;
    return false;
  }
  logGPU << "Kernel created, allocating buffers..." << Logger::endL;
  this->constructArguments(outputNames, outputTypes, true, true);
  this->constructArguments(inputNames, inputTypes, true, false);
  this->SetArguments();
  logGPU << "Kernel creation successful. " << Logger::endL;
  return true;
}

bool GPUKernel::constructArguments(
  const std::vector<std::string>& argumentNames,
  const std::vector<int> &argumentTypes,
  bool isInput, bool isOutput
) {
  std::vector<std::shared_ptr<SharedMemory> >& theArgs = isOutput ? this->outputs : this->inputs;
  cl_int ret = CL_SUCCESS;
  cl_mem_flags bufferFlag = CL_MEM_READ_WRITE;
  if (isInput && isOutput) {
    bufferFlag = CL_MEM_READ_WRITE;
  }
  if (isInput && !isOutput) {
    bufferFlag = CL_MEM_READ_ONLY;
  }
  if (!isInput && isOutput ) {
    bufferFlag = CL_MEM_WRITE_ONLY;
  }
  if (!isInput && !isOutput) {
    logGPU << "GPU kernel arguments are neither input nor output" << Logger::endL;
    return false;
  }
  if (theArgs.size() != 0) {
    logGPU << "Fatal error: arguments not empty. " << Logger::endL;
    return false;
  }
  for (unsigned i = 0; i < argumentNames.size(); i ++) {
    theArgs.push_back(std::make_shared<SharedMemory>());
    std::shared_ptr<SharedMemory> current = theArgs[theArgs.size() - 1];
    current->name = argumentNames[i];
    current->flagIsHOSTWritable = true;
    current->typE = argumentTypes[i];
    size_t defaultBufferSize = 10000000;
    current->theMemory = clCreateBuffer(this->owner->context, bufferFlag, defaultBufferSize, NULL, &ret);
    if (ret != CL_SUCCESS || current->theMemory == NULL) {
      logGPU << "Failed to create buffer \e[31m" << current->name << "\e[39m. Return code: " << ret << Logger::endL;
      return false;
    }
  }
  return true;
}

bool GPUKernel::SetArguments() {
  if (!this->SetArguments(this->outputs, 0))
    return false;
  if (!this->SetArguments(this->inputs, this->outputs.size()))
    return false;
  return true;
}

bool GPUKernel::SetArguments(std::vector<std::shared_ptr<SharedMemory> >& theArgs, unsigned offset) {
  cl_int ret = CL_SUCCESS;
  //std::cout << "DEBUG: kernel: setting " << theArgs.size() << " arguments. "<< std::endl;
  for (unsigned i = 0; i < theArgs.size(); i ++) {
    std::shared_ptr<SharedMemory> current = theArgs[i];
    if (current->typE == SharedMemory::typeVoidPointer)
      ret = clSetKernelArg(this->kernel, i + offset, sizeof(cl_mem), (void *)& current->theMemory);
    if (current->typE == SharedMemory::typeUint)
      ret = clSetKernelArg(this->kernel, i + offset, sizeof(uint), &current->uintValue);

    if (ret != CL_SUCCESS) {
      logGPU << "Failed to set argument " << current->name << ". Return code: " << ret << "." << Logger::endL;
      return false;
    }
  }
  return true;
}

bool GPUKernel::writeToBuffer(unsigned argumentNumber, const std::string& input) {
  return this->writeToBuffer(argumentNumber, input.c_str(), input.size());
}

bool GPUKernel::writeToBuffer(unsigned argumentNumber, const void *input, size_t size) {
  //std::cout << "DEBUG: writing " << input;
  //std::cout << " in buffeR: " << &bufferToWriteInto << std::endl;
  cl_mem& bufferToWriteInto =
      argumentNumber < this->outputs.size() ?
        this->outputs[argumentNumber]->theMemory :
        this->inputs[argumentNumber - this->outputs.size()]->theMemory;
  if (clEnqueueWriteBuffer(
        this->owner->commandQueue,
        bufferToWriteInto,
        CL_TRUE,
        0,
        size,
        input,
        0,
        NULL,
        NULL) != CL_SUCCESS
  ) {
    logGPU << "Enqueueing write buffer failed with input: " << input << Logger::endL;
    return false;
  }
  return true;
}

bool GPUKernel::writeArgument(unsigned argumentNumber, uint input) {
  //std::cout << "DEBUG: writing " << input;
  //std::cout << "Setting: argument number: " << argumentNumber << ", input: " << input << std::endl;
  std::shared_ptr<SharedMemory>& currentArgument =
    argumentNumber < this->outputs.size() ?
    this->outputs[argumentNumber] :
    this->inputs[argumentNumber - this->outputs.size()];
  currentArgument->uintValue = input;
  cl_int ret = clSetKernelArg(this->kernel, argumentNumber, sizeof(uint), &currentArgument->uintValue);
  if (ret != CL_SUCCESS) {
    logGPU << "Set kernel arg failed. " << Logger::endL;
    return false;
  }
  return true;
}
